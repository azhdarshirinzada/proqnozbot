const config = require('config');

const GOOGLEKEY = config.get('keys.GOOGLEKEY'),
	  	TOKEN = config.get('keys.TOKEN'),
			DARKSKYKEY = config.get('keys.DARKSKYKEY')

const TelegramBot = require('node-telegram-bot-api'),
	  	googleMaps = require('@google/maps').createClient({
	  		key: GOOGLEKEY,
	  	}),
	  	request = require('request'),
	  	fs = require('fs');
	  	schedule = require('node-schedule');

const bot = new TelegramBot(TOKEN, {polling: true});

const icons = {
	clear_day: 'https://cdn3.iconfinder.com/data/icons/weather-260/200/sunny-512.png',
	clear_night: 'https://cdn3.iconfinder.com/data/icons/weather-260/200/night-512.png',
	partly_cloudy_day: 'https://cdn3.iconfinder.com/data/icons/weather-260/200/cloudy_day-512.png',
	partly_cloudy_night: 'https://cdn3.iconfinder.com/data/icons/weather-260/200/cloudy_night-512.png',
	cloudy: 'https://cdn3.iconfinder.com/data/icons/weather-260/200/cloudy-512.png',
	rain: 'https://cdn3.iconfinder.com/data/icons/weather-260/200/cloudy_rainy-512.png',
	sleet: 'https://cdn3.iconfinder.com/data/icons/weather-260/200/cloudy_rainy-512.png',
	snow: 'https://cdn3.iconfinder.com/data/icons/weather-260/200/cloudy_snowy_day-512.png',
	wind: 'https://cdn3.iconfinder.com/data/icons/weather-260/200/windy-512.png',
	fog: 'https://cdn3.iconfinder.com/data/icons/weather-260/200/windy-512.png',
};

bot.onText(/\/start/, (msg) => {
	let options = {
		reply_markup: {
			inline_keyboard: [
        [{text: 'Azerbaijani', callback_data: 'AZ'}],
        [{text:'English', callback_data: 'EN'}]
      ],
		},
	};
	bot.sendMessage(msg.chat.id, "Dil seçimini edin.\n\nChoose language.", options);
});

let language;
bot.on("callback_query", function(query) {
	switch(query.data) {
		case 'AZ':
			language = 'az';
			bot.answerCallbackQuery(query.id, "Xoş istifadələr, " + query.from.first_name + ".");
			break;
		case 'EN':
			language = 'en';
			bot.answerCallbackQuery(query.id, "Enjoy, " + query.from.first_name + ".");
			break;
	}
});

bot.onText(/\/help/, (msg) => {
	bot.sendMessage(msg.chat.id, `Proqnozunu öyrənmək istədiyiniz bölgənin adını, mesaj bölməsində, yazın.\n
"Inline" rejimdə istifadə etmək üçün, hər hansısa bir çatın mesaj bölməsində "@proqnozbot <bölgə>" yazıb, proqnozu öyrənin.\n
Bot hər gün istədiyiniz vaxtda sizə havanı xatırlada bilər, bunun üçün "/setreminder" komandasını daxil edib \
gündəlik proqnozu aktiv edin.\n
Məsələn: /setreminder Baku 16:20\n
Gündəlik proqnozu deaktiv etmək üçün /stopreminder komandasını daxil edin.
	`);
});

let job;
bot.onText(/\/setreminder (.+)/, (msg, match) => {
	const [queriedCity, time] = match[1].split(" ");
	const [hours, minutes] = time.split(":");
	
	if (isNaN(+hours) || isNaN(+minutes)) {
		bot.sendMessage(msg.chat.id, "Sorğu yanlışdır.\nİstifadə haqqında daha ətraflı /help");
		return;
	}

	const rule = new schedule.RecurrenceRule();
	rule.hour = +hours;
	rule.minute = +minutes;

	job = schedule.scheduleJob(rule, () => {
		getForecastData(queriedCity)
			.then((answer) => {
				bot.sendMessage(msg.chat.id, answer[0].input_message_content.message_text);
				bot.sendPhoto(msg.chat.id, icons[answer[1]]);
			})
			.catch((err) => {
				bot.sendMessage(msg.chat.id, "Sorğu yanlışdır.\nİstifadə haqqında daha ətraflı /help.");
			});
	});
	bot.sendMessage(msg.chat.id, "Gündəlik proqnoz aktiv edildi.");
});

bot.onText(/\/stopreminder/, (msg) => {
	try {
		job.cancel();
		bot.sendMessage(msg.chat.id, "Gündəlik proqnoz dayandırıldı.")
	} catch (err) {
		bot.sendMessage(msg.chat.id, "Gündəlik proqnoz aktiv edilməyib.");
	}
});

bot.on('message', (msg) => {
	if (msg.entities && msg.entities[0].type == 'bot_command') return;

	const queriedCity = msg.text;
	getForecastData(queriedCity)
		.then((answer) => {
			bot.sendMessage(msg.chat.id, answer[0].input_message_content.message_text);
			bot.sendPhoto(msg.chat.id, icons[answer[1]]);
		})
		.catch((err) => {
			bot.sendMessage(msg.chat.id, "Sorğu yanlışdır.\nİstifadə haqqında daha ətraflı /help.");
		});
});


const cities = JSON.parse(fs.readFileSync('az.json', 'utf-8')).cities;
bot.on('inline_query', (query) => {
	if (!query.query || query.query.startsWith("/")) return;
	const queriedCity = query.query.toLowerCase();
	const matches = cities.filter(city => city.toLowerCase().startsWith(queriedCity));
	const promises = [];

	if (matches.length) {
		for (const city of matches) {
			promises.push(getForecastData(city));
		}
		Promise.all(promises)
			.then((answerToQuery) => {
        let answer = [];
        answerToQuery.forEach((item) => {
          answer.push(item[0]);
        });
			bot.answerInlineQuery(query.id, answer, {cache_time: 0});
			});
	} else {
		getForecastData(queriedCity)
			.then(answerToQuery => {
        		bot.answerInlineQuery(query.id, [answerToQuery[0]], {cache_time: 0});
			});
	}
});

function getForecastData(region) {
	const forecastData = new Object();

	return new Promise((resolve, reject) => {
		googleMaps.geocode({
			address: region,
			region: 'AZ',
		}, (err, response) => {
			if (response.json.status !== "OK") return reject(new Error());
			const typeOfRegion = response.json.results[0].types;
			if (typeOfRegion.includes('political')
			 || typeOfRegion.includes('locality')
			 || typeOfRegion.includes('natural_feature')) {
				forecastData.id = response.json.results[0].place_id;
				forecastData.type = "article";
				forecastData.title = response.json.results[0].formatted_address;
				const {lat, lng} = response.json.results[0].geometry.location;
				const url = getUrl(lat, lng);
				request({url: url, json: true}, (err, response, body) => {
					if (err) return reject(new Error());
					const summary = body.daily.data[0].summary;
					const icon = body.daily.data[0].icon.replace(/-/g, '_');
					const temperature = averageTemperature(body.daily.data[0].temperatureLow, body.daily.data[0].temperatureHigh);
					forecastData.input_message_content = {message_text: `${forecastData.title}:\n\n${summary} ${temperature}°C.`};
					return resolve([forecastData, icon]);
				});
			}
		});
	});
}

function getUrl(lat, lng) {
	if (!language) {
		throw new Error("Language did not set.");
	}
	return "https://api.darksky.net/forecast/" + DARKSKYKEY + "/" + [lat, lng].join(",") + "?lang=" + language + "&si=summary";
}

function averageTemperature(high, low) {
	return Math.round((high + low) / 2);
}