const mongoose = require('mongoose');

class UserFeedback {
    constructor(text, rating) {
        this.text = text;
        this.rating = rating;
    }
}

const RoomSchema = mongoose.Schema({
    _id: String,
    users: [String],
    leader: String,
    users_ready: Number,

    total_rounds: Number,
    rounds_done: Number,

    prompt: String,
    user_entries: [String],
<<<<<<< HEAD
    user_feedback: [{
        text: String,
        rating: Number,
    }],
=======
    user_feedback: [UserFeedback],
>>>>>>> 444913a6c11da6ebc5a24d1f7994c07cd073c2ef

    scores: [Number],
});

const Room = mongoose.model('Room', RoomSchema);

module.exports = Room;
