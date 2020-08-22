const mongoose = require('mongoose');

const RoomSchema = mongoose.Schema({
    _id: String,
    users: [String],
    leader: String,
    users_ready: Number,

    total_rounds: Number,
    rounds_done: Number,

    prompt: String,
    user_entries: [String],
    user_feedback: [{
        text: String,
        rating: Number,
    }],

    scores: [Number],
});

const Room = mongoose.model('Room', RoomSchema);

module.exports = Room;
