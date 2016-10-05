// Importação dos modulos necessários.
var express = require('express');
var router = express.Router();
var firebase = require("firebase");
var fs = require('fs');

fs.readFile('./APIFirebase/client_secret.json',
    function processClientSecrets(err, content) {
        if (err) {
            console.log('Error loading client secret file: ' + err);
            return;
        }
        // Load the credentials
        credentials = JSON.parse(content);

        firebase.initializeApp({
            databaseURL: credentials.web.database_url,
            serviceAccount: credentials.web.service_account,
        });
    });

router.post('/set', function(req, res) {
    console.log("setting: " + JSON.stringify(req.body));
    firebase.database().ref(req.body.url).set(req.body.content);
    res.send();
})

router.post('/get', function(req, res) {
    console.log("getting: " + JSON.stringify(req.body));
    firebase.database().ref(req.body.url).on("value", function(snapshot) {
        res.send(snapshot.val());
    });
})

router.post('/upd', function(req, res) {
    console.log("updating: " + JSON.stringify(req.body));
    firebase.database().ref(req.body.url).update(req.body.content);
    res.send();
})

router.post('/del', function(req, res) {
    console.log("deleting: " + JSON.stringify(req.body));
    firebase.database().ref(req.body.url).remove();
    res.send();
})

module.exports = router;