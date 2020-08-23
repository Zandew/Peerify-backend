const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const { generateKeyPair } = require('crypto');
const { callbackify } = require('util');
const { Users, Rooms } = require('./db.js');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

io.on('connection', socket => {

    socket.emit('createId', makeid(10));

    socket.on('createRoom', (userId, rounds) => {
        console.log("CREATE ROOM "+userId+" "+rounds);
        const roomId = makeid(6);
        Rooms[roomId] = {
            users: [userId],
            leader: userId,
            users_ready: 0,
            
            total_rounds: rounds,
            rounds_done: 0,

            prompt: null,
            user_entries: [null],
            user_evaluation: [{
                text: null,
                userId
            }],
            user_feedback: [{
                text: null,
                rating: null
            }],

            scores: [0]
        }
        Users[userId] = {
            index: 0
        }
        socket.join(roomId);
        socket.emit('sendRoomId', roomId);
        socket.emit('updateList', Rooms[roomId].users);
    });

    socket.on('joinRoom', (userId, roomId) => {
        console.log(Rooms[roomId]);
        if (Rooms[roomId] != null && Rooms[roomId].rounds_done == 0){
            Users[userId] = {
                index: Rooms[roomId].users.length
            }
            Rooms[roomId].users.push(userId);
            Rooms[roomId].user_entries.push(null);
            Rooms[roomId].user_evaluation.push({text: null, userId });
            Rooms[roomId].user_feedback.push({ text: null, rating: null });
            Rooms[roomId].scores.push(0);
            socket.emit('validate');
            socket.join(roomId);
            io.to(roomId).emit('updateList', Rooms[roomId].users);
        }   
    });

    socket.on('startGame', (roomId) => { //emitted when leader clicks start game button
        console.log("START GAME "+roomId);
        io.to(roomId).emit('start', Rooms[roomId].leader); //tells everyone game has started and who is leader 
    });

    socket.on('promptStage', (roomId) => { //emitted by leader when page loads
        console.log("PROMPT STAGE");
        setTimeout(() => {
            io.to(roomId).emit('finishPrompt'); //tells everyone prompt writing time is finished, leader replies with emit('writingStage', prompt)
        }, 5000);
    });

    socket.on('writingStage', (roomId, prompt) => {
        console.log("WRITING STAGE");
        Rooms[roomId].prompt = prompt;
        io.to(roomId).emit('prompt', prompt);//tells everyone the prompt
        setTimeout(() => {
            io.to(roomId).emit('finishWriting');//tells everyone writing time is over, everyone replies with emit('sendText', {...})
        }, 20000);
    });

    socket.on('sendText', (userId, roomId, text) => {
        console.log("GOT TEXT "+userId+" "+roomId+" "+text);
        const idx = Users[userId].index;
        Rooms[roomId].user_entries[idx] = text;
        Rooms[roomId].users_ready += 1;
        if (Rooms[roomId].users_ready == Rooms[roomId].users.length) {
            var userList = Rooms[roomId].users;
            var entryList = Rooms[roomId].user_entries;
            for (let i=userList.length-1; i>0; i--){
                const j = Math.floor(Math.random() * i);
                [userList[i], userList[j]] = [userList[j], userList[i]];
                [entryList[i], entryList[j]] = [entryList[j], entryList[i]];
            }
            let entry0 = entryList[0];
            entryList.shift();
            entryList.push(entry0);
            for (let i=0; i<userList.length; i++){
                Rooms[roomId].user_evaluation[Users[userId].index] = {
                    text: entryList[i],
                    userId: userList[(i+1)%userList.length]
                }
            }
            Rooms[roomId].users_ready = 0; 
            io.to(roomId).emit('allSubmitted'); //tells everyone their entries have been shuffled and ready to retrieve
            console.log("READY FOR EVAL");
        }
    });

    socket.on('getEvaluation', (userId, roomId) => { //everyone emits this to get the entry that they will evaluate
        console.log("GOT EVAL");
        console.log(Rooms[roomId]);
        socket.emit('evaluation', Rooms[roomId].user_evaluation[Users[userId].index].text); //after getting entry leader replies with emit('evaluationStage', roomId)
    });

    socket.on('evaluationStage', roomId => {//leader call
        console.log("EVAL STAGE");
        setTimeout(() => {
            io.to(roomId).emit('finishEvaluation');//tells everyone evaluation stage is over and everyone sends their feedback with emit('sendEvaluation', {...})
        }, 20000);
    });

    socket.on('sendEvaluation', (userId, roomId, text, rating) => {
        const writer = Rooms[roomId].user_evaluation[Users[userId].index].userId;
        Rooms[roomId].user_feedback[Users[writer].index] = {
            text,
            rating
        }
        Rooms[roomId].scores[Users[writer].index] += rating;
        Rooms[roomId].users_ready += 1;
        if (Rooms[roomId].users_ready == Rooms[roomId].users.length) {
            /*tells everyone that all feedback has been given and to get it using emit('getFeedback', {...}) 
            and total score emit('getScore', {...}), leader replies emit('feedbackStage', roomId)*/
            io.to(roomId).emit('allEvaluated');
            Rooms[roomId].users_ready = 0;
        }
    });

    socket.on('getFeedback', (userId, roomId) => {
        io.to(roomId).emit('feedback', Rooms[roomId].user_feedback[Users[userId].index]);//sends user's feedback
    });

    socket.on('getScore', (userId, roomId) => {
        io.to(roomId).emit('score', Rooms[roomId].scores[Users[userId].index]);//sends users score
    });

    socket.on('sendReadyNextGame', (userId, roomId) => {
        Rooms[roomId].users_ready += 1;
        if (Rooms[roomId].users_ready == Rooms[roomId].users.length) {
            Rooms[roomId].leader = Rooms[roomId].userList[Math.floor(Math.random() * Rooms[roomId].userList.length)];

            io.to(roomId).emit('allReadyNextGame');
            io.to(roomId).emit('play', Rooms[roomId].leader);
            Rooms[roomId].users_ready = 0;
        }
    });

    socket.on('feedbackStage', roomId => {
        setTimeout(() => {
            Rooms[roomId].rounds_done += 1;
            if (Rooms[roomId].rounds_done == Rooms[roomId].rounds){
                io.to(roomId).emit('gameOver'); //game over
            }else {
                Rooms[roomId].leader = Rooms[roomId].users[Math.floor(Math.random() * Rooms[roomId].users.length)];
                io.to(roomId).emit('finishFeedback');
            }
        }, 20000);
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