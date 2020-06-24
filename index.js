/**
 * A Bot for Slack!
 */


/**
 * Define a function for initiating a conversation on installation
 * With custom integrations, we don't have a way to find out who installed us, so we can't message them :(
 */

process.env.GOOGLE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTlMQV-CPgObIcvmj0HK4uOLRy13AiVaBKmw1jfIn52tIEtxQdDM16zV9wel19CoXiFiVaCXQerZ1v7/pubhtml';

function onInstallation(bot, installer) {
    if (installer) {
        bot.startPrivateConversation({user: installer}, function (err, convo) {
            if (err) {
                console.log(err);
            } else {
                convo.say('I am a bot that has just joined your team');
                convo.say('You must now /invite me to a channel so that I can be of use!');
            }
        });
    }
}


/**
 * Configure the persistence options
 */

var config = {};
if (process.env.MONGOLAB_URI) {
    var BotkitStorage = require('botkit-storage-mongo');
    config = {
        storage: BotkitStorage({mongoUri: process.env.MONGOLAB_URI}),
    };
} else {
    config = {
        json_file_store: ((process.env.TOKEN)?'./db_slack_bot_ci/':'./db_slack_bot_a/'), //use a different name if an app or CI
    };
}

var Botkit = require('botkit');
var os = require('os');
var memwatch = require('memwatch-next');
var http = require('http');
var GoogleSpreadsheet = require("google-spreadsheet");
var request = require('request');
var bot, oldMessage, controller, loadedData;

if (!process.env.BOT_TOKEN) {
    console.log('Error: Please specify bot token in environment');
    process.exit(1);
}

if (!process.env.GOOGLE_URL) {
    console.log('Error: Please specify google url in environment');
    process.exit(1);
}

if(process.env.GOOGLE_URL){
	process.env.GOOGLE_URL = process.env.GOOGLE_URL.match(/[-\w]{25,}/);
}

memwatch.on('leak', function(info) {
	console.log('MEMORY LEAK')
	console.log(info);
});

var my_sheet = new GoogleSpreadsheet(process.env.GOOGLE_URL);

var loadData = function(reload){
	if(bot){
		bot.closeRTM();
	}
	if(controller){
		delete controller;
	}
	controller = Botkit.slackbot({
			debug: false,
	});

	bot = controller.spawn({
		token: process.env.BOT_TOKEN
	}).startRTM(function(){
		console.log('ready');
		if(reload){
			bot.reply(oldMessage, "I'm back!");
		}
	});

	var ask = function(message, convo, q){
		convo.ask(q.says,[
				{
					 pattern: bot.utterances.yes,
					 callback: function(response, convo) {
					 		convo.next();
							if(q.yes){
									var next = loadedData[q.yes-2];
									doo(message, next);
							}
					 }
				},
				{
					pattern: bot.utterances.no,
					callback: function(response, convo) {
						convo.next();
						if(q.no){
								var next = loadedData[q.no-2];
								doo(message, next);
						}
					}
				},
				{
					default: true,
					callback: function(response, convo) {
						  	convo.next();
						  	console.log('##OTHER');
						  	console.log(q.other);
							if(q.other){
									var next = loadedData[q.other-2];
									doo(message, next);
							}
					}
				}
			]);
	};

	var doo = function(message, q){
		if(q.conversation){
			bot.startConversation(message,function(err, convo) {
				ask(message, convo, q);
			});
		}else{
			var say = q.says.split('\n');
			say = say[Math.floor(Math.random() * say.length)];
			say = say.replace('$', message.match[1]);

			var link = q.attachment.split('\n');
			var attachments = [];

			if(link.length){
				var attachment = {
					title: link[0].replace('$', message.match[1]),
					text: link[1],
					color: '#FFCC99',
					image_url: link[2],
					fields: []
				};
				attachments.push(attachment);
			}

			if(link[0] === 'WIKISEARCH'){
				bot.startTyping(message);
				request.post({
						url:'https://en.wikipedia.org/w/api.php',
						form:{
							action:'opensearch',
							limit:1,
							search:message.match[1]
						}
					},
					function (error, response, body) {
						// console.log(response);
					  if (!error && response.statusCode == 200) {
					    var wikiData = JSON.parse(body) // Show the HTML for the Google homepage. 

					    attachments[0].title = wikiData[1][0] || 'Sorry';
					    if(wikiData[2][0]){
					    	attachments[0].text = (wikiData[2][0] + '\n' + wikiData[3][0])
					    }else{
							attachments[0].text = "I couldn't find that";
					    }
					    // console.log(attachments);
					    // console.log(wikiData[2]);
						bot.replyWithTyping(message, {
							text: say,
							attachments: attachments
						});
					  }
				});
			}else{
				bot.replyWithTyping(message, {
					text: say,
					attachments: attachments
				});
			}
		}
	};

	my_sheet.getRows( 1, function(err, row_data){
		loadedData = row_data;
		for(var key in row_data){
			(function(){
				var q = row_data[key];

				var hears = ('\\b'+q.hears.replace(/\n/g, '\\b\n\\b')+'\\b').split('\n');
				console.log(hears);
				controller.hears(hears,'direct_message,direct_mention,mention',function(bot, message) {
					doo(message, q);
				});
			})();
		}
	});

	// Reboot the system
	controller.hears('reload','direct_message,direct_mention,mention',function(bot, message) {
		oldMessage = message;
		bot.reply(message,"Reloading... beep boop bip....");
		bot.rtm.close();
		loadData(true);
	});

};

loadData();


// To keep Heroku's free dyno awake
http.createServer(function(request, response) {
    response.writeHead(200, {'Content-Type': 'text/plain'});
    response.end('Ok, dyno is awake.');
}).listen(process.env.PORT || 5000);

/**
 * Are being run as an app or a custom integration? The initialization will differ, depending
 */

if (process.env.TOKEN || process.env.SLACK_TOKEN) {
    //Treat this as a custom integration
    var customIntegration = require('./lib/custom_integrations');
    var token = (process.env.TOKEN) ? process.env.TOKEN : process.env.SLACK_TOKEN;
    var controller = customIntegration.configure(token, config, onInstallation);
} else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.PORT) {
    //Treat this as an app
    var app = require('./lib/apps');
    var controller = app.configure(process.env.PORT, process.env.CLIENT_ID, process.env.CLIENT_SECRET, config, onInstallation);
} else {
    console.log('Error: If this is a custom integration, please specify TOKEN in the environment. If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment');
    process.exit(1);
}


/**
 * A demonstration for how to handle websocket events. In this case, just log when we have and have not
 * been disconnected from the websocket. In the future, it would be super awesome to be able to specify
 * a reconnect policy, and do reconnections automatically. In the meantime, we aren't going to attempt reconnects,
 * WHICH IS A B0RKED WAY TO HANDLE BEING DISCONNECTED. So we need to fix this.
 *
 * TODO: fixed b0rked reconnect behavior
 */
// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function (bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function (bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});


/**
 * Core bot logic goes here!
 */
// BEGIN EDITING HERE!

//controller.on('bot_channel_join', function (bot, message) {
 //   bot.reply(message, "I'm here!")
//});

//controller.hears(['hello', 'hi', 'greetings'], ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
  //  bot.reply(message, 'Hello!');
//});


/**
 * AN example of what could be:
 * Any un-handled direct mention gets a reaction and a pat response!
 */
//controller.on('direct_message,mention,direct_mention', function (bot, message) {
//    bot.api.reactions.add({
//        timestamp: message.ts,
//        channel: message.channel,
//        name: 'robot_face',
//    }, function (err) {
//        if (err) {
//            console.log(err)
//        }
//        bot.reply(message, 'I heard you loud and clear boss.');
//    });
//});
