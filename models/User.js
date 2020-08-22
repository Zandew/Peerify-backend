const mongoose = require('mongoose');

const UserSchema = mongoose.Schema({
    _id: String,
    text: String,
});

const User = mongoose.model('User', UserSchema);

module.exports = User;