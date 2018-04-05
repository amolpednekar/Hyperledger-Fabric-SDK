'use strict';
/*
* Copyright IBM Corp All Rights Reserved
*
* SPDX-License-Identifier: Apache-2.0
*/
/*
 * Register and Enroll a user
 */

var Fabric_Client = require('fabric-client');
var Fabric_CA_Client = require('fabric-ca-client');

var path = require('path');
var util = require('util');
var os = require('os');
var fs = require('fs');

//
var fabric_client = new Fabric_Client();
var fabric_ca_client = null;
var admin_user = null;
var member_user = null;
var store_path = path.join(__dirname, 'hfc-key-store');
console.log(' Store path:' + store_path);

var adminLib = require('./admin');

var network_config = require("../../network/network.json")

// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
const initUser = (storePath, caUrl, orgName) => {
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

const fetchUser = (userEnrollmentID) => {
    return fabric_client.getUserContext(userEnrollmentID, true)
        .catch((err) => {
            console.error('Failed to fetch user: ' + err);
            return Promise.reject(err);
        });
}

const registerAndEnrollUser = (enrollmentID, enrollmentSecret, admin, mspId) => {
    console.log("registerAndEnrollUser");

    return fabric_ca_client.register({
        enrollmentID: enrollmentID, enrollmentSecret: enrollmentSecret, affiliation: 'org2.department1',
        role: 'client',maxEnrollments:5, attrs: [{ name: 'role', value: 'buyer seller', Ecert: true }]
    }, admin)
        .then(secret => {
            return fabric_ca_client.enroll({ enrollmentID: enrollmentID, enrollmentSecret: secret });
        }).then((enrollment) => {
            console.log('Successfully enrolled member');
            return fabric_client.createUser(
                {
                    username: enrollmentID,
                    mspid: mspId,
                    cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }
                });
        }).then((user) => {
            member_user = user;
            return fabric_client.setUserContext(member_user);
        }).then(() => {
            console.log('User was successfully registered and enrolled and is ready to intreact with the fabric network');

        }).catch((err) => {
            console.error('Failed to register: ' + err);
            if (err.toString().indexOf('Authorization') > -1) {
                console.error('Authorization failures may be caused by having admin credentials from a previous CA instance.\n' +
                    'Try again after deleting the contents of the store directory ' + store_path);
            }
        });
}

const enrollUser = (enrollmentID, enrollmentSecret, mspId) => {
    return fabric_ca_client.enroll({ enrollmentID: enrollmentID, enrollmentSecret: enrollmentSecret })
        .then((enrollment) => {
            console.log('Successfully enrolled member');
            return fabric_client.createUser(
                {
                    username: enrollmentID,
                    mspid: mspId,
                    cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }
                });
        }).then((user) => {
            member_user = user;
            return fabric_client.setUserContext(member_user);
        }).then(() => {
            console.log('User was successfully registered and enrolled and is ready to intreact with the fabric network');

        }).catch((err) => {
            console.error('Failed to register: ' + err);
            if (err.toString().indexOf('Authorization') > -1) {
                console.error('Authorization failures may be caused by having admin credentials from a previous CA instance.\n' +
                    'Try again after deleting the contents of the store directory ' + store_path);
            }
        });

}


(async () => {
    var store_path = path.join(__dirname, 'hfc-key-store');
    await initUser(store_path, 'http://10.80.64.237:7054', "org1")
    const admin = await adminLib.fetchAdmin(fabric_client, "admin", true);
    // console.log(admin);
    //const user = await fetchUser("user9");
   // if (!user) {
    //await registerAndEnrollUser("user1", "secret", admin, "Org1MSP")
    //await enrollUser("user13", "secret", "Org2MSP")
   // }


})().catch(err => {
    console.log(err);
});