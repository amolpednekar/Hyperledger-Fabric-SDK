
var Client = require('fabric-client');
var util = require('util');
var fs = require('fs');
var path = require('path');
var grpc = require('grpc');

var org1peersurl = [{url:"grpc://10.244.5.45:7051",eventurl:"grpc://10.244.5.45:7053"},{url:"grpc://10.244.5.45:8051",eventurl:"grpc://10.244.5.45:8053"}];
var org2peersurl = [{url:"grpc://10.244.5.45:9051",eventurl:"grpc://10.244.5.45:9053"},{url:"grpc://10.244.5.45:10051",eventurl:"grpc://10.244.5.45:10053"}];

var client = new Client();
//invokechaincode(channel_name,org1mspid,'org1',org1peersurl,org2peersurl,"mychaincodeid","acc1","acc2","30")
//creates the orderer object and initialize it with the endpoint and the tls certificate of ordering service node
var orderer = client.newOrderer(
    "grpc://10.244.5.45:7050",
    {
        'ssl-target-name-override': 'orderer.example.com'
    }
);

function invokechaincode(channel_name,orgName,orgPath,apeers,zpeers,chaincodeId,fcn,args){
    client = new Client();
	var channel = client.newChannel(channel_name);
	channel.addOrderer(orderer)
	for (var i=0;i<apeers.length;i++) {
	
		let peer = apeers[i];
		data = fs.readFileSync("../../network/crypto-config/peerOrganizations/"+orgPath+".example.com/peers/peer"+i+"."+orgPath+".example.com/msp/tlscacerts/tlsca."+orgPath+".example.com-cert.pem");
	
		let peer_obj = client.newPeer(
							peer.url,
							{
								pem: Buffer.from(data).toString(),
								'ssl-target-name-override': "peer"+i+"."+orgPath+".example.com"
							}
						);
		
		channel.addPeer(peer_obj);
	}
	for (var i=0;i<zpeers.length;i++) {
	
		let peer = zpeers[i];
		data = fs.readFileSync("../../network/crypto-config/peerOrganizations/"+"org2"+".example.com/peers/peer"+i+"."+"org2"+".example.com/msp/tlscacerts/tlsca."+"org2"+".example.com-cert.pem");
	
		let peer_obj = client.newPeer(
							peer.url,
							{
								pem: Buffer.from(data).toString(),
								'ssl-target-name-override': "peer"+i+"."+"org2"+".example.com"
							}
						);
		channel.addPeer(peer_obj);
	}
	Client.newDefaultKeyValueStore({
		path: "/hfc-test-kvs/"+orgName
	}).then((store) => {
	
		client.setStateStore(store);
		return getAdmin(client,orgPath,orgName);
		
	}).then((admin) => {
		return channel.initialize();
		
	}, (err) => {
		console.log('Failed to enroll user admin ',err);
	}).then(() => {
	
		tx_id = client.newTransactionID();
		
		//build invoke request
		var request = {
			chaincodeId : chaincodeId,
			fcn: fcn,
			args: args,
			txId: tx_id,
		};
		// send proposal to endorser
		return channel.sendTransactionProposal(request);
	
	}, (err) => {
		console.log('Failed to initialize the channel: ',err);
	}).then((results) =>{
	
		//get the endorsement response from the peers and check for response status
		pass_results = results;
		// console.log("Results: ",results)
		var proposalResponses = pass_results[0];

		var proposal = pass_results[1];
		var all_good = true;
		for(var i in proposalResponses) {
			let one_good = false;
			let proposal_response = proposalResponses[i];
			if( proposal_response.response && proposal_response.response.status === 200) {
				console.log('transaction proposal has response status of good');
				one_good = channel.verifyProposalResponse(proposal_response);
				if(one_good) {
					console.log(' transaction proposal signature and endorser are valid');
				}
			} else {
				console.log('transaction proposal was bad');
			}
			all_good = all_good & one_good;
		}
		if (all_good) {
			
			//checks if the proposal has same read/write sets.
			//This will validate that the endorsing peers all agree on the result of the chaincode execution.
			all_good = channel.compareProposalResponseResults(proposalResponses);
			if(all_good){
				console.log(' All proposals have a matching read/writes sets');
			}
			else {
				console.log(' All proposals do not have matching read/write sets');
			}
		}
		if (all_good) {
			// check to see if all the results match
			console.log('Successfully sent Proposal and received ProposalResponse');
			console.log('Successfully sent Proposal and received ProposalResponse: ', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload.toString());

			var request = {
				proposalResponses: proposalResponses,
				proposal: proposal
			};
			var invokeId = tx_id.getTransactionID();
			
			eh = client.newEventHub();
			let data = fs.readFileSync("../../network/crypto-config/peerOrganizations/"+orgPath+".example.com/peers/peer0."+orgPath+".example.com/tls/ca.crt");
			eh.setPeerAddr(apeers[0].eventurl, {
					pem: Buffer.from(data).toString(),
					'ssl-target-name-override': 'peer0.'+orgPath+'.example.com'
			});
			eh.connect();
				
			let txPromise = new Promise((resolve, reject) => {
					let handle = setTimeout(() => {
						eh.disconnect();
						reject();
					}, 30000);

					eh.registerTxEvent(invokeId, (tx, code) => {
						console.log('The chaincode invoke transaction has been committed on peer ',eh._ep._endpoint.addr);
						clearTimeout(handle);
						eh.unregisterTxEvent(invokeId);
						eh.disconnect();
						if (code !== 'VALID') {
							console.log('The chaincode invoke transaction was invalid, code = ',code);
							reject();
							
						} else {
							console.log('The chaincode invoke transaction was valid.');
							resolve();
							
						}
					});
			});
			
			//sends the endorsement response to the orderer for ordering
			var sendPromise = channel.sendTransaction(request);
			
			return Promise.all([sendPromise].concat([txPromise])).then((results) => {
				console.log('Event promise all complete and testing complete');
				return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
			}).catch((err) => {
				console.log('Failed to send instantiate transaction and get notifications within the timeout period:P ', err)
				return 'Failed to send instantiate transaction and get notifications within the timeout period.';
			});
		
		}
	
	}).then((response) => {

		//gets the final response from the orderer and check the response status
		if (response.status === 'SUCCESS') {
			console.log('Successfully sent transaction to the orderer.');
		
		} else {
			console.log('Failed to order the transaction. Error code: ',err);

		}
	}, (err) => {

		console.log('Failed to send transaction due to error: ',err);

		
	});
	
}

function getAdmin(client, userOrg,mspID){

	var keyPath = '../../network/crypto-config/peerOrganizations/'+userOrg+'.example.com/users/Admin@'+userOrg+'.example.com/msp/keystore';
	var keyPEM = Buffer.from(readAllFiles(keyPath)[0]).toString();
	var certPath = '../../network/crypto-config/peerOrganizations/'+userOrg+'.example.com/users/Admin@'+userOrg+'.example.com/msp/signcerts';
	var certPEM = readAllFiles(certPath)[0];
	return Promise.resolve(client.createUser({
		username: 'peer'+userOrg+'Admin',
		mspid: mspID,
		cryptoContent: {
			privateKeyPEM: keyPEM.toString(),
			signedCertPEM: certPEM.toString()
		}
	}));

}


function readAllFiles(dir) {
	var files = fs.readdirSync(dir);
	var certs = [];
	files.forEach((file_name) => {
		let file_path = path.join(dir,file_name);
		let data = fs.readFileSync(file_path);
		certs.push(data);
	});
	return certs;
}


invokechaincode("mychannel","Org1MSP","org1",org1peersurl,org2peersurl,"fabcar_cid2","queryAllCars",[])
