const express = require('express');

const user = require('./user');

const router = express.Router();

router.get('/search/:userId/:query', user.search);
router.get('/friend/:userId/:friendId', user.addFriend);
router.get('/unfriend/:userId/:friendId', user.removeFriend);

module.exports = router;