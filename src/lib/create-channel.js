'use strict';


if (global && global.hfc) global.hfc.config = undefined;
require('nconf').reset();
var utils = require('fabric-client/lib/utils.js');
var logger = utils.getLogger('E2E create-channel');

var Client = require('fabric-client');
var util = require('util');
var fs = require('fs');
var path = require('path');
var grpc = require('grpc');

var testUtil = require('./util.js');

var network_config = require("../../network/network.json")
var config_path = "../../network/network.json";
const createChannel = () => {
    return new Promise(function (resolve, reject) {
        Client.addConfigFile(config_path);
        var fabric = Client.getConfigSetting('fabric');
        var channels = fabric.channel;
        if (!channels || channels.length === 0) {
            return Promise.resolve();
        }

        var channel = channels[0];

        var ORGS = fabric.network;
        var caRootsPath = ORGS.orderer.tls_cacerts;
        var data = fs.readFileSync(path.join(__dirname, '../..', caRootsPath));
        var caroots = Buffer.from(data).toString();
        utils.setConfigSetting('key-value-store', 'fabric-client/lib/impl/FileKeyValueStore.js');

        // Acting as a client in first org when creating the channel
        let client = new Client();
        let org = channel.organizations[0];
        let orderer = client.newOrderer(
            ORGS.orderer.url,
            {
                'pem': caroots,
                'ssl-target-name-override': ORGS.orderer['server-hostname']
            }
        );

        let config = null;
        let signatures = [];

        return Client.newDefaultKeyValueStore({
            path: testUtil.storePathForOrg(org)
        })
            .then((store) => {
                client.setStateStore(store);
                var cryptoSuite = Client.newCryptoSuite();
                console.log("testUtil.storePathForOrg(org)", testUtil.storePathForOrg(org));
                cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({ path: testUtil.storePathForOrg(org) }));
                client.setCryptoSuite(cryptoSuite);
                return testUtil.getOrderAdminSubmitter(client);
            })
            .then((admin) => {
                // use the config update created by the configtx tool
                let envelope_bytes = fs.readFileSync(path.join(__dirname, '../..', channel.config));
                config = client.extractChannelConfig(envelope_bytes);

                // TODO: read from channel config instead of binary tx file

                // sign the config for each org

                client._userContext = null;
                let t=null;
                let item=channels[0].organizations[0];
                return testUtil.getSubmitter(client, t, true, item).then((orgAdmin) => {
                    // sign the config
                    let signature = client.signChannelConfig(config);
                    // TODO: signature counting against policies on the orderer
                    // at the moment is being investigated, but it requires this
                    // weird double-signature from each org admin
                    signatures.push(signature);
                    signatures.push(signature);
                    return Promise.resolve();
                })
                    .then(() => {
                        client._userContext = null;
                        return testUtil.getOrderAdminSubmitter(client);
                    })
                    .then((orderAdmin) => {
                        // sign the config
                        var signature = client.signChannelConfig(config);

                        // collect signature from orderer admin
                        // TODO: signature counting against policies on the orderer
                        // at the moment is being investigated, but it requires this
                        // weird double-signature from each org admin
                        signatures.push(signature);
                        signatures.push(signature);

                        // build up the create request
                        let tx_id = client.newTransactionID();
                        var request = {
                            config: config,
                            signatures: signatures,
                            name: channel.name,
                            orderer: orderer,
                            txId: tx_id
                        };

                        // send create request to orderer
                        return client.createChannel(request);
                    })
                    .then((result) => {
                        if (result.status && result.status === 'SUCCESS') {
                            console.log("Created "+ channel.name + ' successfully');
                            return Promise.resolve();
                        }
                        else {
                            throw new Error('create status is ' + result.status);
                        }
                    });
            })
    })
}


createChannel();