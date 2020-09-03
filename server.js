const http = require('https');
const express = require('express');
const socketio = require('socket.io');
const { generateKeyPair } = require('crypto');
const { callbackify } = require('util');
const { Users, Rooms } = require('./db.js');

const fs = require('fs');

const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/peerify.live/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/peerify.live/cert.pem'),
    ca: fs.readFileSync('/etc/letsencrypt/live/peerify.live/chain.pem')
};

const app = express();
const server = http.createServer(options).listen(5000);
const io = socketio(server);

const spawn = require('child_process').spawn;

function roomExists(want_room, room_list) {
    for(room in room_list) {
        if(room == want_room)
            return true;
    }
    return false;
}

function split_string(str) {
    let ret = [];
    let curr = "";
    for(let i=0; i<str.length; i++){
        if(str[i] == ' ' || str[i] == '\n'){
            if(curr.length > 0) ret.push(curr);
            curr = "";
        }else curr += str[i];
    }
    if(curr.length > 0) ret.push(curr);
    return ret;
}

io.on('connection', socket => {
    socket.on('createId', () => {
        socket.emit('getId', makeid(10));
    });

    socket.on('createRoom', (userId, nickname, rounds) => {
        console.log("CREATE ROOM " + userId + " " + rounds);
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
            user_nicknames: {
                
            },
            positive_words: { //stores occurences

            },
            negative_words: {

            },
            process: null,

            scores: [0]
        }
        Users[userId] = {
            index: 0
        }
        Rooms[roomId].user_nicknames[userId] = nickname;
        socket.join(roomId);
        socket.emit('sendRoomId', roomId);
        socket.emit('updateList', Rooms[roomId].users);
    });

    socket.on('setNickname', (userId, roomId, nickname) => {
        if(Rooms[roomId] == undefined){
            // console.log("tried to set nickname but invalid room")
            return;
        }
        // console.log("successfully updated nick");
        Rooms[roomId].user_nicknames[userId] = nickname;
    });

    socket.on('getRoomList', roomId => {
        if(Rooms[roomId] == undefined){
            // console.log("tried to get room list but invaild room")
            return;
        }
        // console.log("successfully got room list")
        // console.log(Rooms[roomId].user_nicknames);
        socket.emit('roomList', Rooms[roomId].user_nicknames);
    });

    socket.on('joinRoom', (userId, roomId) => {
        console.log(userId + " tried to join " + roomId);
        if(!roomExists(roomId, Rooms)){
            socket.emit('joinStatus', 'FAILED');
        }else{
            socket.emit('joinStatus', roomId);
            Users[userId] = {
                index: Rooms[roomId].users.length
            }
            Rooms[roomId].users.push(userId);
            Rooms[roomId].user_entries.push(null);
            Rooms[roomId].user_evaluation.push({text: null, userId });
            Rooms[roomId].user_feedback.push({ text: null, rating: null });
            Rooms[roomId].scores.push(0);
            socket.join(roomId);
    
            io.to(roomId).emit('playerJoined', Rooms[roomId].user_nicknames[userId]);
        }
    });

    socket.on('startGame', (roomId) => { //emitted when leader clicks start game button
        console.log("START GAME "+roomId);
        if(Rooms[roomId] != undefined){
            io.to(roomId).emit('start', Rooms[roomId].leader);
            // if(Rooms[roomId].users.length < 2) io.to(roomId).emit('start', "FAILED");
            // else io.to(roomId).emit('start', Rooms[roomId].leader); //tells everyone game has started and who is leader 
        }
    });

    socket.on('promptStage', (roomId) => { //emitted by leader when page loads
        console.log("PROMPT STAGE");
        if(Rooms[roomId] != undefined){
            setTimeout(() => {
                io.to(roomId).emit('finishPrompt'); //tells everyone prompt writing time is finished, leader replies with emit('writingStage', prompt)
            }, 5000000);
        }
    });

    socket.on('writingStage', (roomId, prompt) => {
        console.log("WRITING STAGE");
        if(Rooms[roomId] != undefined){
            Rooms[roomId].prompt = prompt;
            io.to(roomId).emit('prompt', prompt);//tells everyone the prompt
            setTimeout(() => {
                Rooms[roomId].users_ready = 0;
                io.to(roomId).emit('finishWriting');//tells everyone writing time is over, everyone replies with emit('sendText', {...})
            }, 5000000);
        }
    });

    socket.on('sendText', (userId, roomId, text) => {
        if(Rooms[roomId] != undefined){
            console.log("GOT TEXT "+userId+" "+roomId+" "+text);
            const idx = Users[userId].index;
            Rooms[roomId].user_entries[idx] = text;
            Rooms[roomId].users_ready += 1;
            if (Rooms[roomId].users_ready == Rooms[roomId].users.length) {
                var userList = JSON.parse(JSON.stringify(Rooms[roomId].users));
                var entryList = Rooms[roomId].user_entries;
                for (let i=userList.length-1; i>0; i--){
                    const j = Math.floor(Math.random() * i);
                    [userList[i], userList[j]] = [userList[j], userList[i]];
                    // [entryList[i], entryList[j]] = [entryList[j], entryList[i]];
                }
                // let entry0 = entryList[0];
                // entryList.shift();
                // entryList.push(entry0);
                for (let i=0; i<userList.length; i++){
                    Rooms[roomId].user_evaluation[Users[userList[i]].index] = {
                        text: entryList[i],
                        userId: Rooms[roomId].users[i],
                    }
                    console.log(userList[i] + " matched with " + Rooms[roomId].users[i]);
                }
                Rooms[roomId].users_ready = 0; 
                io.to(roomId).emit('allSubmitted'); //tells everyone their entries have been shuffled and ready to retrieve
                console.log("READY FOR EVAL");
            }
        }
    });

    socket.on('getEvaluation', (userId, roomId) => { //everyone emits this to get the entry that they will evaluate
        console.log("GOT EVAL");
        if(Rooms[roomId] != undefined){
            console.log(Rooms[roomId]);
            socket.emit('evaluation', Rooms[roomId].user_evaluation[Users[userId].index].text); //after getting entry leader replies with emit('evaluationStage', roomId)
        }
    });

    socket.on('evaluationStage', roomId => {//leader call
        console.log("EVAL STAGE");
        if(Rooms[roomId] != undefined){
            setTimeout(() => {
                Rooms[roomId].users_ready = 0;
                io.to(roomId).emit('finishEvaluation');//tells everyone evaluation stage is over and everyone sends their feedback with emit('sendEvaluation', {...})
            }, 5000000);
        }
    });

    socket.on('sendEvaluation', (userId, roomId, text, rating) => {
        if(Rooms[roomId] != undefined){
            const writer = Rooms[roomId].user_evaluation[Users[userId].index].userId;
            console.log(Users[userId].index + " to " + Users[writer].index + ": " + text);
            Rooms[roomId].user_feedback[Users[writer].index] = {
                text,
                rating
            }
            Rooms[roomId].scores[Users[writer].index] += rating;
            Rooms[roomId].users_ready += 1;
            console.log(Rooms[roomId].users_ready + " " + Rooms[roomId].users.length);
            if (Rooms[roomId].users_ready == Rooms[roomId].users.length) {
                Rooms[roomId].users_ready = 0;
                /*tells everyone that all feedback has been given and to get it using emit('getFeedback', {...}) 
                and total score emit('getScore', {...}), leader replies emit('feedbackStage', roomId)*/
                io.to(roomId).emit('allEvaluated');
            }

            const pythonProcess = spawn('python3', ["./main.py", text])
            let words = [], values = [];
            let done_word = false;
            // console.log(pythonProcess);
            pythonProcess.stdout.on('data', (t) => {
                let data = t.toString();
                let temp = split_string(data);
                let len = temp.length/2;
                for(let i=0; i<len; i++){
                    words.push(temp[i]);
                    values.push(temp[i+len]);
                }
                for(let i=0; i<words.length; i++){
                    if(values[i] == "1"){
                        if(Rooms[roomId].negative_words[words[i]] == undefined)
                            Rooms[roomId].negative_words[words[i]] = 0;
                        Rooms[roomId].negative_words[words[i]] += 1;
                    }else{
                        if(Rooms[roomId].positive_words[words[i]] == undefined)
                            Rooms[roomId].positive_words[words[i]] = 0;
                        Rooms[roomId].positive_words[words[i]] += 1;
                    }
                }
                console.log("PRINTED DATA")
                console.log(temp)
            });
        }
    });

    socket.on('getFeedback', (userId, roomId) => {
        if(Rooms[roomId] != undefined){
            console.log(userId + " " + Users[userId].index);
            console.log(Rooms[roomId].user_feedback);
            socket.emit('feedback', Rooms[roomId].user_feedback[Users[userId].index]);//sends user's feedback
        }
    });

    socket.on('getScore', (userId, roomId) => {
        if(Rooms[roomId] != undefined){
            socket.emit('score', Rooms[roomId].scores[Users[userId].index]);//sends users score
        }
    });

    socket.on('feedbackStage', roomId => {
        if(Rooms[roomId] != undefined){
            setTimeout(() => {
                Rooms[roomId].users_ready = 0;
                io.to(roomId).emit('finishFeedback');
            }, 5000000);
        }
    });

    socket.on('doneWithFeedback', (roomId) => {
        if (Rooms[roomId] != undefined) {
            Rooms[roomId].users_ready += 1;
            if (Rooms[roomId].users_ready == Rooms[roomId].users.length) {
                Rooms[roomId].users_ready = 0;
                console.log("ALL DONE WITH FEEDBACK");
                io.to(roomId).emit('allDoneWithFeedback');
            }
        }
    });

    socket.on('doneScoreboard', roomId => {
        if (Rooms[roomId] != undefined) {
            Rooms[roomId].users_ready += 1;
            if (Rooms[roomId].users_ready == Rooms[roomId].users.length) {
                Rooms[roomId].users_ready = 0;
                console.log("EVERYONE DONE WITH SCOREBOARD");
                io.to(roomId).emit('scoreboardStageOver');
            }
        }
    });

    socket.on('scoreboardStage', roomId => {
        if (Rooms[roomId] != undefined) {
            setTimeout(() => {
                console.log("SCOREBOARD OVER");
                Rooms[roomId].users_ready = 0;
                io.to(roomId).emit('scoreboardStageOver');
            }, 200000);
        }
    });

    socket.on('sendReadyNextGame', (roomId) => {
        if(Rooms[roomId] != undefined){
            Rooms[roomId].users_ready += 1;
            if (Rooms[roomId].users_ready == Rooms[roomId].users.length) {
                // io.to(roomId).emit('play', Rooms[roomId].leader);
                Rooms[roomId].users_ready = 0;
                Rooms[roomId].rounds_done += 1;
                // console.log(Rooms[roomId].rounds_done + " " + Rooms[roomId].rounds);
                if(Rooms[roomId].rounds_done == Rooms[roomId].total_rounds){
                    io.to(roomId).emit('gameOver'); //game over
                }else{
                    Rooms[roomId].leader = Rooms[roomId].users[Math.floor(Math.random() * Rooms[roomId].users.length)];
                    io.to(roomId).emit('allReadyNextGame', Rooms[roomId].leader);
                }
            }
        }
    });

    socket.on('getResults', (roomId, top) => {
        if(Rooms[roomId] != undefined){
            let results = [];
            for (let i=0; i<Rooms[roomId].users.length; i++){
                results.push({
                    name: Rooms[roomId].user_nicknames[Rooms[roomId].users[i]],
                    score: Rooms[roomId].scores[i],
                })
            }
            results.sort((a, b) => (a.score > b.score ? -1 : 1));
            if (results.length < 3) {
                results.push({ name: "", score: 0 });
            }
            while (results.length < top) {
                results.push({ name: "", score: 0});
            }
            if (top==3){
                console.log(Rooms[roomId].positive_words);
                console.log(Rooms[roomId].negative_words);
                socket.emit('finalResults', results[0], results[1], results[2], Rooms[roomId].positive_words, Rooms[roomId].negative_words);
            }else {
                io.to(roomId).emit('results', results.slice(0, 5));
            }
        }
    });

    socket.on('getEntries', roomId => {
        let array = [];
        for (let i=0; i<Rooms[roomId].users.length; i++){
            array.push({
                name: Rooms[roomId].user_nicknames[Rooms[roomId].users[i]],
                text: Rooms[roomId].user_entries[i]
            })
        }
        io.to(roomId).emit('entries', array);
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