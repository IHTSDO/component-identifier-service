/**
 * Created by ar on 7/31/15.
 */

var idRepo = require("./../blogic/IdReposition");
var auxConcept=require("../model/auxConcept");
var auxDescription=require("../model/auxDescription");
var auxRelationship=require("../model/auxRelationship");
var namespaceDm = require("../blogic/NamespaceDataManager");

var idTotal=100000;

var runner = function (){
    namespaceDm.getNamespaces(function(err, namespaces) {
        if (err) {
            console.log("[ERROR] " + (new Date()).getTime() + ": namespace=" + namespace + ", partition=" + partitionId + ". " + err);
            return;
        }
        console.log("namespaces " + namespaces);
        if (namespaces) {
            console.log("namespaces " + namespaces.length);
            namespaces.forEach(function (namespaceRecord) {
                if (namespaceRecord.namespace==0){
                    console.log("namespaceRecord.idPregenerate=" + namespaceRecord.idPregenerate);
                }
                if (namespaceRecord.idPregenerate && namespaceRecord.idPregenerate == "1") {
                    console.log("Ids pregeneration for namespaceId " + namespaceRecord.namespace);
                    var namespace = namespaceRecord.namespace;
                    var partitionId = '00';
                    idRepo.idBulkCreation(auxConcept, namespace, partitionId, idTotal, function (err) {
                        if (err) {
                            console.log("[ERROR] " + (new Date()).getTime() + ": namespace=" + namespace + ", partition=" + partitionId + ". " + err);
                        }
                        partitionId = '01';
                        idRepo.idBulkCreation(auxDescription, namespace, partitionId, idTotal, function (err) {
                            if (err) {
                                console.log("[ERROR] " + (new Date()).getTime() + ": namespace=" + namespace + ", partition=" + partitionId + ". " + err);
                            }
                            partitionId = '02';
                            idRepo.idBulkCreation(auxRelationship, namespace, partitionId, idTotal, function (err) {
                                if (err) {
                                    console.log("[ERROR] " + (new Date()).getTime() + ": namespace=" + namespace + ", partition=" + partitionId + ". " + err);
                                }
                            });
                        });
                    });
                }
            });
        }
    });
};

runner();

setInterval(runner,36000000);
//setTimeout(runner,5000);
