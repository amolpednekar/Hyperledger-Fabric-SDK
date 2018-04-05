'use strict'

var os   = require('os');
var path = require('path');

var tempdir = path.join(os.tmpdir(), 'hfc-key-store');

module.exports = {
    tempdir: tempdir
}