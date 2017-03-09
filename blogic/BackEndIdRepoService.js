/**
 * Created by ar on 7/31/15.
 */

var idRepo = require("./../blogic/IdReposition");
var auxConcept=require("../model/auxConcept");
//var auxDescription=require("../model/auxDescription");
//var auxRelationship=require("../model/auxRelationship");

var idTotal=100000;

var runner = function (){

    var namespace='0';
    var partitionId='00';
    console.log("step 1");
    idRepo.idBulkCreation(auxConcept, namespace, partitionId, idTotal, function(err){
        console.log("step 2");
        if (err){
            console.log("[ERROR] " + (new Date()).getTime() + ": namespace=" + namespace + ", partition=" + partitionId + ". " +  err);
        }
        //partitionId='01';
        //idRepo.idBulkCreation(auxDescription, namespace, partitionId, idTotal, function(err){
        //    if (err){
        //        console.log("[ERROR] " + (new Date()).getTime() + ": namespace=" + namespace + ", partition=" + partitionId + ". " +  err);
        //    }
        //    partitionId='02';
        //    idRepo.idBulkCreation(auxRelationship, namespace, partitionId, idTotal, function(err) {
        //        if (err) {
        //            console.log("[ERROR] " + (new Date()).getTime() + ": namespace=" + namespace + ", partition=" + partitionId + ". " + err);
        //        }
        //    });
        //});
    });
};

//setInterval(runner,86000000);
setTimeout(runner,5000);