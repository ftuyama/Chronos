$(document).ready(function() {

    /*
        ===========================================================================
                               Communication with Server
        ===========================================================================
    */
    var username;
    var socket = io.connect('/', {
        path: '/chatS'
    });
    $('form').submit(function() {
        socket.emit('chat message', $('#text').val());
        $('#text').val('');
        return false;
    });

    /*
        ===========================================================================
                                Receive Server Messages
        ===========================================================================
    */
    socket.on('connected', function(msg) {
        /* Register self */
        if (username == undefined)
            register_self(msg);
        else printMsg(msg, 'connected');
    });
    socket.on('chat', function(msg) {
        printMsg(msg, 'chat');
    });
    socket.on('disconnected', function(msg) {
        printMsg(msg, 'disconnected');
    });
    socket.on('history', function(history) {
        [dest, msg] = [history.dest, history.msg];
        if (dest != username) return;
        var kind = msg.key.split(':').slice(1, 2)[0];
        msg.value = JSON.parse(msg.value);
        printMsg(msg, kind);
    });

    /*
        ===========================================================================
                                Proccess Received Messages
        ===========================================================================
    */

    function printMsg(msg, kind) {
        var time = msg.key.split(':').slice(5, 8).join(':');
        $('#messages').append(
            $('<p>').html(time + "  " + user_credential(msg.value.user) +
                '<span style="color:#6c6"> ' + kind + '</span> ' +
                msg.value.message
            )
        );
        processUsers(msg, kind);
        scrollBotton();
    }

    function processUsers(msg, kind) {
        if (kind == "connected")
            $('#users').append(
                $('<p id="' + msg.value.user + '">').html(user_credential(msg.value.user))
            );
        else if (kind == "disconnected")
            $("[id='" + msg.value.user + "']").remove();
    }

    function register_self(msg) {
        username = msg.value.user;
        $('#users').append($('<p>').html(user_credential(username)));
    }

    /*
        ===========================================================================
                                Helpers to Manage View
        ===========================================================================
    */

    function user_credential(user) {
        return '<b style="color:' + stringToColour(user) + '">@' + user + '</b>';
    }

    function scrollBotton() {
        var scroll = document.getElementById('messages');
        scroll.scrollTop = scroll.scrollHeight
    }

});