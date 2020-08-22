const mongoose = require('mongoose');

const RoomSchema = mongoose.Schema({
    _id: String,
    users: [String],
    leader: String,
    submissions: Number
});

const Room = mongoose.model('Room', RoomSchema);

module.exports = Room;