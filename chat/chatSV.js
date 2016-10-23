/*
  ===========================================================================
            Chat Application written with Socket.io
  ===========================================================================
*/
// Importing packages
var app = require('express')();
var express = require('express');
var router = express.Router();
// Setting socket.io application
var appl = require("../server");
var server = appl.server;
var redis = appl.redis;
var io = require('socket.io')(server, { path: '/chatS' });
var config = require('../config');
var user;

/*
  ===========================================================================
                    Definindo Sessão e Conexão básica
  ===========================================================================
*/

router.get('/', function(req, res) {
    if (req.session == null || req.session == undefined ||
        req.session.access_token == null || req.session.access_token == undefined)
        return res.redirect('/calendarAuth');
    user = req.session.passport.user;
    res.sendFile(__dirname + '/chat.html');
});

io.on('connection', function(socket) {
    socket.handshake.session = user;
    if (user != undefined) {
        retrieveChatHistory();
        sendEvent('connected', '', user);
    }
    socket.on('disconnect', function() { sendEvent('disconnected', '', socket.handshake.session) });
    socket.on('chat message', function(msg) { sendEvent('chat', msg, socket.handshake.session) });
    socket.on('spam', function(msg) { sendSpam(msg) });
});

/*
  ===========================================================================
                    Fire Chat Messages - Redis / View
  ===========================================================================
*/

function sendEvent(kind, msg, user) {
    try {
        var event = getEvent(kind, msg, user, timeStamp());
        console.log(user.displayName + ' ' + kind + ': ' + msg);
        redis.set(event.key, JSON.stringify(event.value));
        io.emit(kind, event);
    } catch (err) {
        console.log('error: ' + err);
    }
}

function getEvent(kind, msg, user, time_stamp) {
    return {
        'key': 'chat:' + kind + ':' + time_stamp,
        'value': {
            'user': user.displayName,
            'message': msg,
            'img': retrieveImageUrl(user)
        }
    };
}

function retrieveChatHistory() {
    redis.keys('chat:*', function(err, keys) {
        keys = dancaDoCrioulo(keys);
        keys.forEach(function(key) {
            redis.get(key, function(err, value) {
                if (user != undefined) {
                    io.emit('history', {
                        'dest': user.displayName,
                        'msg': { key, value }
                    });
                }
            });
        });
    });
}

function sendSpam(msg) {
    io.emit('spam', {
        'key': 'chat:spam:' + timeStamp(),
        'value': { 'user': 'Anon', 'message': msg }
    });
}

/*
  ===========================================================================
                    Auxialliary Functions - Code Smell
  ===========================================================================
*/

function retrieveImageUrl(profile) {
    if (typeof profile._json['picture'] != "undefined")
        return profile._json['picture'];
    return profile._json.image['url'];
}

function dancaDoCrioulo(keys) {
    keys = jogaParaTras(keys);
    keys = keys.sort();
    keys = jogaParaFrente(keys);
    return keys;
}

function jogaParaTras(keys) {
    new_keys = [];
    keys.forEach(function(key) {
        new_keys.push(
            key.split(':').slice(2).join(':') + ':' +
            key.split(':').slice(0, 2).join(':')
        );
    });
    return new_keys;
}

function jogaParaFrente(keys) {
    new_keys = [];
    keys.forEach(function(key) {
        new_keys.push(
            key.split(':').slice(7).join(':') + ':' +
            key.split(':').slice(0, 7).join(':')
        );
    });
    return new_keys;
}

function timeStamp() {
    return new Date().toISOString().replace(/\-|\T|\./g, ':');
}

module.exports = router;