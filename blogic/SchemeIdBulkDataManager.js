/**
 * Created by ar on 7/16/15.
 */
var dbInit=require("../config/dbInit");
var stateMachine=require("../model/StateMachine");
var db={};
var model;
var sets=require('simplesets');
var Sync = require('sync');

var fs = require('fs');
var path=require('path');
var schemes=[];
// Bootstrap models
var generators_path = __dirname + '/SchemeIdGenerator';
fs.readdirSync(generators_path).forEach(function (file) {
    if (~file.indexOf('.js')) {
        var schemeName=path.basename(file, '.js');
        schemes[schemeName.toUpperCase()]=require(generators_path + '/' + file)
    }
});

function getModel(callback) {
    if (model) {
        //console.log("Model from cache.");
        callback(null);
    } else {
        dbInit.getDB(function (err, pdb, podel1) {
            if (err) {
                callback(err);
            } else {

                db = pdb;
                model = podel1;
                //console.log("Model from dbinit.");
                callback(null);
            }
        })
    }
}

var throwErrMessage=function(msg){
    var err={};
    err.message=msg;
    return err;
};

var getSchemeIds=function (scheme, schemeIdArray, callback){

    schemeIdArray.forEach(function(schemeId){
        if (schemeId==null || schemeId==""){
            callback(throwErrMessage("SchemeId is null."),null);
            return;
        }else{

            if (!schemes[scheme.toUpperCase()].validSchemeId(schemeId)){

                callback(throwErrMessage("Not valid schemeId:" + schemeId),null);
                return;
            }
        }
    });
    var objQuery={scheme:scheme.toUpperCase(),schemeId: schemeIdArray};
    getModel(function(err) {
        if (err) {
            callback(err, null);
        }else {
            getSchemeIdRecords(objQuery, function (err, schemeIdRecords) {
                if (err) {
                    callback(err, null);
                    return;
                }
                var resArray=[];
                //if (schemeIdRecords ){
                schemeIdRecords.forEach(function(schemeIdRecord){
                    resArray.push(schemeIdRecord.schemeId);
                });
                var rA=new sets.StringSet(resArray);
                var rQ=new sets.StringSet(schemeIdArray);
                var diff=rQ.difference(rA).array();
console.log("getSchemeIds diff:" +  JSON.stringify(diff));
                if (diff && diff.length>0){
                    var cont=0;
                    diff.forEach(function(schemeId){

                        getFreeRecord(scheme,schemeId, null,function (err, record) {
                            if (err) {
                                callback(err, null);
                            } else {
                                cont++;
                                schemeIdRecords.push(record);
                                //console.log("getSchemeId record:" + JSON.stringify(record));
                                if (cont==diff.length) {
                                    callback(null, schemeIdRecords);
                                    return;
                                }
                            }
                        });
                    });
                }else {
                    callback(null, schemeIdRecords);
                }
            });
        }
    });
};

function getFreeRecord(scheme, schemeId, systemId, callback){
    Sync(function() {
        var schemeIdRecord = getNewRecord(scheme, schemeId, systemId);
        schemeIdRecord.status = stateMachine.statuses.available;
        var newRecord = insertSchemeIdRecord.sync(null, schemeIdRecord);

        callback(null, newRecord);
    });
}
function getNewRecord(scheme, schemeId, systemId){
    var schemeIdRecord= {
        scheme: scheme.toUpperCase(),
        schemeId: schemeId,
        sequence: schemes[scheme.toUpperCase()].getSequence( schemeId),
        checkDigit: schemes[scheme.toUpperCase()].getCheckDigit( schemeId)
    };
    if (systemId) {
        schemeIdRecord.systemId = systemId;
    }else{
        schemeIdRecord.systemId = guid();
    }
    return schemeIdRecord;
}

var getSchemeIdBySystemIds=function (scheme, systemIds, callback){
    var objQuery={scheme:scheme.toUpperCase(), systemId:systemIds};
    getModel(function(err) {
        if (err) {
            callback(err, null);
        }else {
            getSchemeIdRecords(objQuery, function (err, schemeIdRecords) {
                if (err) {
                    callback(err, null);
                }
                callback(null, schemeIdRecords);
            });
        }
    });
};

function getSchemeIdRecords(objQuery, callback){
    model.schemeId.find(objQuery, function (err, schemeIds) {
        if (err) {
            callback(err,null);
        }else {
            callback(null, schemeIds);
        }
    });
};

var registerSchemeIds=function ( operation, callback){
    var cont=0;
    var records=[];
    var error=false;
    var scheme=operation.scheme;
    for (var i=0;i<operation.records.length;i++) {
        var schemeId = operation.records[i].schemeId;
        var systemId = operation.records[i].systemId;
        if (error){
            break;
        }
        getSchemeId(scheme, schemeId, systemId, function (err, schemeIdRecord) {
            if (error){
                return;
            }
            if (err) {
                error=true;
                callback(err);
                return;
            } else {

                var newStatus = stateMachine.getNewStatus(schemeIdRecord.status, stateMachine.actions.register);
                if (newStatus) {

                    schemeIdRecord.status = newStatus;
                    schemeIdRecord.author = operation.author;
                    schemeIdRecord.software = operation.software;
                    schemeIdRecord.expirationDate = operation.expirationDate;
                    schemeIdRecord.comment = operation.comment;
                    schemeIdRecord.jobId = operation.jobId;

                    records.push(schemeIdRecord);
                    cont++;
                    if (cont == operation.records.length) {
                        cont = 0;
                        for (var j = 0; j < records.length; j++) {

                            records[j].save(function (err) {
                                if (err) {
                                    error=true;
                                    callback(err);
                                    return;
                                }
                                cont++;
                                if (cont == records.length) {
                                    callback(null);
                                    return;

                                }

                            });
                        }
                    }
                } else {
                    error=true;
                    callback("Cannot register SchemeId:" + schemeIdRecord.schemeId + ", current status: " + schemeIdRecord.status);
                    return;
                }
            }

        });
    }

};
var updateSchemeIds=function ( operation, callback){
    var cont=0;
    var records=[];
    var error=false;
    var scheme=operation.scheme;
    for (var i=0;i<operation.schemeIds.length;i++) {
        var SchemeId = operation.schemeIds[i];
        if (error) {
            break;
        }
        getSchemeId(scheme, SchemeId, null, function (err, schemeIdRecord) {
            if (error) {
                return;
            }
            if (err) {
                error = true;
                callback(err);
                return;
            } else {


                var newStatus = stateMachine.getNewStatus(schemeIdRecord.status,operation.action);
                if (newStatus) {

                    schemeIdRecord.status = newStatus;
                    schemeIdRecord.author = operation.author;
                    schemeIdRecord.software = operation.software;
                    schemeIdRecord.comment = operation.comment;
                    schemeIdRecord.jobId = operation.jobId;
                    records.push(schemeIdRecord);
                    cont++;
                    if (cont == operation.schemeIds.length) {
                        cont = 0;
                        for (var j = 0; j < records.length; j++) {

                            records[j].save(function (err) {
                                if (err) {
                                    error = true;
                                    callback(err);
                                    return;
                                }
                                cont++;
                                if (cont == records.length) {
                                    callback(null);
                                    return;

                                }

                            });
                        }
                    }
                } else {
                    error = true;
                    callback("Cannot " + operation.action + " SchemeId:" + schemeIdRecord.schemeId + ", current status: " + schemeIdRecord.status);
                    return;
                }
            }
        });
    }
};

var getSchemeId=function (scheme, schemeId, systemId, callback) {
    Sync(function () {
        if (!schemes[scheme.toUpperCase()].validSchemeId(schemeId)){
            callback("Not valid SchemeId: " + schemeId, null);
            return;
        }
        var objQuery = {scheme: scheme, schemeId: schemeId};
        getModel.sync(null);
        var schemeIdRecord = getSchemeIdRecord.sync(null, objQuery);
        if (!schemeIdRecord) {
            var record = getFreeRecord.sync(null,scheme, schemeId, systemId);
            callback(null, record);
        } else {
            callback(null, schemeIdRecord);
        }
    });
};


function insertSchemeIdRecord(newSchemeIdRecord, callback){
    Sync(function() {
        var newSchemeIdRecord2 = model.schemeId.create.sync(null, newSchemeIdRecord);
        callback(null, newSchemeIdRecord2);
    });
}

var guid = (function() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return function() {
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    };
})();


function generateSchemeId( operation, thisScheme, callback){
    Sync(function() {
        try{
            getModel.sync(null);

            setNewSchemeIdRecord.sync(null, operation, thisScheme);

            callback(null);

        } catch (e) {
            callback(e);
        }
    });
};

function setNewSchemeIdRecord(operation, thisScheme, callback) {
    Sync(function () {
        try {

            var previousCode=thisScheme.idBase;
            var newSchemeId=schemes[thisScheme.scheme.toUpperCase()].getNextId(previousCode);
            thisScheme.idBase=newSchemeId;
            var scheme=thisScheme.scheme;

            var systemId ;
            var action=operation.action;
            if (operation.systemId && operation.systemId.trim() != "") {
                systemId = operation.systemId;
            }
            var schemeIdRecord = getSchemeId.sync(null, scheme, newSchemeId,systemId);


            var newStatus = stateMachine.getNewStatus(schemeIdRecord.status, action);
            if (newStatus) {

                schemeIdRecord.status = newStatus;
                schemeIdRecord.author = operation.author;
                schemeIdRecord.software = operation.software;
                schemeIdRecord.expirationDate = operation.expirationDate;
                schemeIdRecord.comment = operation.comment;
                schemeIdRecord.jobId=operation.jobId;
                schemeIdRecord.save.sync(null);
                callback(null);
            } else {
                setNewSchemeIdRecord.sync(null, operation, thisScheme);
                callback(null);
            }
        } catch (e) {
            var error="error:" + e;
            console.error(error); // something went wrong
            callback(error);
        }
    });
};

function getScheme(key,callback) {
    model.schemeIdBase.get(key, function (err, scheme) {
        if (err) {
            callback(err, null);
        } else {
            if (!scheme) {
                callback("Scheme not found for key:" + JSON.stringify(key), null);
            } else {
                callback(null, scheme);
            }
        }
    });
};
function getSchemeIdRecord(objQuery, callback){
    Sync(function() {
        var SchemeIds = model.schemeId.find.sync(null, objQuery);
        if (SchemeIds.length > 0) {
            callback(null, SchemeIds[0]);
        } else {
            callback(null, null);
        }
    });
};

var generateSchemeIds=function ( operation, callback) {
    getModel(function (err) {
        if (err) {
            console.log("error model:" + err);
            callback(err);
        } else {
            //var schemeIdRecords = [];
            var cont = 0;
            var key=operation.scheme;
            //console.log("key:" + JSON.stringify(key));

            getScheme(key,function(err,data) {
                if (err){
                    callback(err);
                }else {
                    if (!data){
                        callback("Scheme not found for key:" + JSON.stringify(key));
                    }
                    var thisScheme=data;
                    console.log("getting scheme :" + JSON.stringify(thisScheme) + " for key:" + JSON.stringify(key));
                    for (var i = 0; i < operation.quantity; i++) {

                        Sync(function () {
                            try {
                                operation.systemId = operation.systemIds[i];
                                generateSchemeId.sync(null, operation, thisScheme);
                                //schemeIdRecords.push(schemeIdRecord);
                                cont++;
                                if (operation.quantity == cont) {
                                    thisScheme.save(function (err) {
                                        if (err) {
                                            callback(err);
                                        } else {
                                            console.log("saving scheme :" + JSON.stringify(thisScheme) + " for key:" + JSON.stringify(key));
                                            callback(null);
                                        }
                                    });
                                }
                            } catch (e) {
                                console.error("generateSchemeIds error:" + e); // something went wrong
                                callback(e);
                            }
                        });
                    }
                }
            });
        }
    });
};
module.exports.generateSchemeIds=generateSchemeIds;
module.exports.registerSchemeIds=registerSchemeIds;
module.exports.getSchemeIdBySystemIds=getSchemeIdBySystemIds;
module.exports.getSchemeIds=getSchemeIds;
module.exports.updateSchemeIds=updateSchemeIds;