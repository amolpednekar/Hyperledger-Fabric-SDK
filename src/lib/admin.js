'use strict';
/*
* Copyright IBM Corp All Rights Reserved
*
* SPDX-License-Identifier: Apache-2.0
*/
/*
 * Enroll the admin user
 */

var Fabric_Client = require('fabric-client');
var Fabric_CA_Client = require('fabric-ca-client');

var path = require('path');
var util = require('util');
var os = require('os');
var fs = require('fs')
//
var fabric_client = new Fabric_Client();
var fabric_ca_client = null;
var admin_user = null;
var member_user = null;
var store_path = path.join(__dirname, 'hfc-key-store');

var network_config = require("../../network/network.json")

// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
const initAdmin = (storePath, caUrl, orgName) => {
    return Fabric_Client.newDefaultKeyValueStore({
        path: storePath
    }).then((state_store) => {
        // assign the store to the fabric client
        fabric_client.setStateStore(state_store);
        var crypto_suite = Fabric_Client.newCryptoSuite();
        // use the same location for the state store (where the users' certificate are kept)
        // and the crypto store (where the users' keys are kept)
        var crypto_store = Fabric_Client.newCryptoKeyStore({ path: storePath });
        crypto_suite.setCryptoKeyStore(crypto_store);
        fabric_client.setCryptoSuite(crypto_suite);
        var tlsCa = network_config.fabric.network[orgName].ca.tls_cacerts

        var tlsCaPem = Buffer.from(fs.readFileSync(path.join("../..", tlsCa))).toString()

        var tlsOptions = {
            trustedRoots: [tlsCaPem],
            verify: false
        };
        // be sure to change the http to https when the CA is running TLS enabled
        //fabric_ca_client = new Fabric_CA_Client('https://tlsca.org1.example.com:7054', tlsOptions);
        fabric_ca_client = new Fabric_CA_Client(caUrl, tlsOptions);
        // first check to see if the admin is already enrolled
        return Promise.resolve(true);
    })
}

const fetchAdmin = (fabric_client, admin, checkPersistence) => {
    console.log("Fetching admin: ", admin);
    return fabric_client.getUserContext(admin, true)
        .catch((err) => {
            console.error('Failed to fetch admin from memory/state_store: ' + err);
            return Promise.reject(err.toString());
        })
}

const enrollAdmin = (enrollmentId, enrollmentSecret, mspId) => {
    // need to enroll it with CA server
    return fabric_ca_client.enroll({
        enrollmentID: enrollmentId,
        enrollmentSecret: enrollmentSecret
    }).then((enrollment) => {
        console.log('Successfully enrolled admin user "admin"');
        return fabric_client.createUser(
            {
                username: enrollmentId,
                mspid: mspId,
                cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }
            });
    }).then((user) => {
        admin_user = user;
        return fabric_client.setUserContext(admin_user);
    }).catch((err) => {
        console.error('Failed to enroll and persist admin. Error: ' + err.stack ? err.stack : err);
        return Promise.reject('Failed to enroll admin');
    });
}

//Test Code

// (async () => {
//     await initAdmin(store_path, 'https://10.80.64.237:7054', "org1")
//     const admin = await fetchAdmin(fabric_client, "admin", true);
//     if (!admin) {
//         await enrollAdmin("admin", "adminpw", "Org1MSP")
//     }
// })()
//     .catch((err) => {
//         console.log("err", err);
//     });

module.exports = { initAdmin, fetchAdmin, enrollAdmin }