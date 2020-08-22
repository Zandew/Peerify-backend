const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const User = require('./models/User');
const Room = require('./models/Room');
const mongoose = require('mongoose');
const { generateKeyPair } = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const MongoURI = 'mongodb+srv://andrew:ax021009@cluster0.wbg0q.mongodb.net/Cluster0?retryWrites=true&w=majority';
mongoose
    .connect(MongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log("MongoDB Connected...")
    })
    .catch((err) => console.log(err));

Room.findById('1', function(error, room) {
    if (room.submissions == room.users.length) {
        var userList = room.users;
        for (let i=0; i<userList.length; i++){
        }
        for (let i=userList.length-1; i>0; i--){
            const j = Math.floor(Math.random() * i);
            [userList[i], userList[j]] = [userList[j], userList[i]];
        }
        console.log(userList);
        User.findById(userList[0], function(error, user) {
            if (error) {
                console.log(error);
            }
            let text0 = user.text;
            console.log(text0);
            for (let i=0; i<userList.length-1; i++){
                User.findById(userList[i+1], function(error, user) {
                    console.log("found next");
                    User.update(
                        { _id: userList[i] },
                        { text: user.text },
                        function(err, success) {
                            
                        }
                    );
                });
            }
            User.update(
                { _id: userList[userList.length-1] },
                {text: text0}
            );
        });
    }
});

io.on('connection', socket => {

    socket.emit('createId', makeid(10));

    socket.on('createRoom', userId => {
        const roomId = makeid(6);
        const newRoom = new Room({
            id: roomId,
            users: [userId],
            leader: userId,
            submissions: 0
        });
        newRoom.save();
        socket.join(roomId);
        socket.emit(roomId);
    });

    socket.on('joinRoom', (userId, roomId) => {
        Room.update(
            { _id: roomId},
            { $push: { users: userId }},
            function (error, success) {
                if (error) {
                    console.log(error);
                } else {
                    console.log("joined room");
                }
            }
        );
    });

    socket.on('startTimer', (roomId) => {
        setTimeout(() => {
            io.to(roomId).emit('collectResults');
        }, 5000);
    });

    socket.on('sendText', (userId, roomId, text) => {
        User.update(
            { _id: userId },
            { text },
            function(error, success) {
                console.log("received text");
                Room.update(
                    { _id : roomId },
                    { $inc : {submissions: 1} },
                    function (error, success) {
                        Room.findById(roomId, function(error, room) {
                            if (room.submissions == room.users.length) {
                                
                            }
                        });
                    }
                )
            }
        );
    });

});

function makeid(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

const PORT = 5000;

server.listen(PORT);