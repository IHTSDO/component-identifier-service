/**
 * Created by ar on 7/16/15.
 */
var dbInit=require("../config/dbInit");
var stateMachine=require("../model/StateMachine");
var sctid=require("../model/sctid");
var sctIdHelper=require("../utils/SctIdHelper");
var partitionLockManager = require ("./PartitionLockManager");
var model;

function getModel(callback){
    if (model){
        callback(null);
    }else {
        dbInit.getDB(function (err, pdb, podel1) {
            if (err) {
                callback(err);
            }else {

                model = podel1;
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

var checkSctid = function (sctid, callback) {
    var err = "";

    var partitionId = "";
    var checkDigit = null;
    var sequence = null;
    var namespaceId = null;
    var isValid = "true";
    var comment = "";

    if (sctid == null) {
        err = "SctId is not a number.";
        isValid = "false";

    } else if (sctid.match(/[\D]/)) {
        err = "SctId is not a number.";
        isValid = "false";

    } else if (sctid.length < 6) {
        err = "SctId length is less than 6 digits.";
        isValid = "false";
    } else if (sctid.length > 18) {
        err = "SctId length is greater than 18 digits.";
        isValid = "false";
    }

    if (isValid == "true") {
        if (!sctIdHelper.validSCTId(sctid)) {
            err = "SctId is not valid.";
            isValid = "false";
        }

        try {
            partitionId = sctIdHelper.getPartition(sctid);
        } catch (e) {
            err += " PartitionId error:" + e;
        }

        var partitionCtrl = true;
        if (partitionId != "") {
            if (partitionId != "00"
                && partitionId != "01"
                && partitionId != "02"
                && partitionId != "10"
                && partitionId != "11"
                && partitionId != "12"
                && partitionId != "03"
                && partitionId != "13"
                && partitionId != "04"
                && partitionId != "14"
                && partitionId != "05"
                && partitionId != "15") {

                err += " Partition Id " + partitionId + " is not valid.";
                isValid = "false";
                partitionCtrl = false;
            }
        }

        var tmp;
        try {
            tmp = sctid.toString();
            tmp.substr(tmp.length - 1, 1);

            checkDigit = parseInt(tmp.substr(tmp.length - 1, 1));
        } catch (e) {
            err += " Check digit error:" + e;
        }

        if (isValid == "false" && partitionCtrl && checkDigit != null) {
            try {
                var id = sctid.substr(0, sctid.length - 1);
                var cd = sctIdHelper.verhoeffCompute(id);
                if (cd != checkDigit) {
                    err += " Check digit should be " + cd + ".";
                }
            } catch (e) {
                err += " Check digit error:" + e;
            }

        }
        try {
            tmp = sctid.toString();
            if (partitionId.substr(0, 1) == "1") {
                if (tmp.length > 10) {
                    sequence = parseFloat(tmp.substr(0, tmp.length - 10));
                }
            } else {
                sequence = parseFloat(tmp.substr(0, tmp.length - 3));
            }
        } catch (e) {
            err += " Sequence error:" + e;
        }
        try {
            tmp = sctid.toString();
            if (partitionId.substr(0, 1) == "1") {
                if (tmp.length > 10) {
                    namespaceId = parseInt(tmp.substr(tmp.length - 10, 7));
                } else {
                    err += " PartitionId first digit is '1', it identifies an extension SCTID, " +
                        "but no namespace could be identified";
                }
            } else {
                namespaceId = 0;
            }

        } catch (e) {
            err += " Namespace error:" + e;
        }
        if (namespaceId && partitionCtrl) {
            if (partitionId.substr(0, 1) == "1" && namespaceId == 0) {
                isValid = "false";
                err += " PartitionId first digit is '1', it identifies an extension SCTID, " +
                    "but no namespace could be identified";
            }
        }
        if (sequence == null
            || namespaceId == null
            || checkDigit == null
            || partitionId == null
            || partitionId == "") {
            isValid = "false";

        }

        if (isValid == "true") {
            if (namespaceId == 0) {
                comment = "Core ";
            } else {
                comment = "Extension ";
            }
            if (partitionId && partitionId != "") {
                var art = partitionId.substr(1, 1);
                if (art == "0") {
                    comment += "concept Id";
                } else if (art == "1") {
                    comment += "description Id";
                } else if (art == "2") {
                    comment += "relationship Id";
                } else if (art == "3") {
                    comment += "subset Id (RF1)";
                } else if (art == "4") {
                    comment += "mapset Id (RF1)";
                } else if (art == "5") {
                    comment += "target Id (RF1)";
                } else {
                    comment += "artifact";
                }
            }
        }
    }
    var result = {
        "sctid": sctid,
        "sequence": sequence,
        "namespace": namespaceId,
        "partitionId": partitionId,
        "componentType": comment,
        "checkDigit": checkDigit,
        "isSCTIDValid": isValid,
        "errorMessage": err,
        "namespaceOrganization": "",
        "namespaceContactEmail": ""
    };
    if (isValid == "true" && namespaceId != null) {
        getModel(function (error) {
            if (error) {
                err += " " + error;
                result.errorMessage = err;
                callback(error, result);

            } else {
                model.namespace.find({namespace: namespaceId}, function (error, namespaceResult) {
                    if (error) {
                        err += " " + error;
                        result.errorMessage = err;
                        callback(null, result);
                    } else {
                        if (namespaceResult.length > 0) {
                            result.namespaceOrganization = (namespaceResult[0].organizationName == null) ? "" : namespaceResult[0].organizationName;
                            result.namespaceContactEmail = (namespaceResult[0].email == null) ? "" : namespaceResult[0].email;
                        }
                        callback(null, result);
                    }
                });
            }
        });
    } else {
        callback(null, result);

    }
};

var getSctids = function (query, limit, skip, callback){
    var objQuery={};
    var limitR = 100;
    var skipTo = 0;
    if (limit)
        limitR = limit;
    if (skip)
        skipTo = skip;
    if (query)
        objQuery = query;
    sctid.find(objQuery,limitR,skipTo, function (err, sctids) {
        if (err) {
            callback(err, null);
        } else {
            callback(null, sctids);
        }
    });
};

var getSctid=function (sctId, callback) {
    if (!sctIdHelper.validSCTId(sctId)) {
        callback(throwErrMessage("Not valid SCTID."), null);
        return;
    }
    var objQuery = {sctid: sctId};

    sctid.findById(objQuery, function (err, sctIdRecord) {
        if (err) {
            callback(err, null);
        } else {
            if (!sctIdRecord) {
                getFreeRecord(sctId, function (err, record) {
                    if (err) {
                        callback(err, null);
                    } else {
                        callback(null, record);
                    }
                });
            } else {
                callback(null, sctIdRecord);
            }
        }
    });
};

function getFreeRecord(sctid, callback){
    var sctIdRecord= getNewRecord(sctid);
    sctIdRecord.status= stateMachine.statuses.available;
    insertSCTIDRecord(sctIdRecord,function(err,newRecord){
        if (err){
            callback(err,null);
        }else{
            callback(null,newRecord);
        }

    });
}
function getNewRecord(sctid){
    var sctIdRecord= {
        sctid: sctid,
        sequence: sctIdHelper.getSequence(sctid),
        namespace: sctIdHelper.getNamespace(sctid),
        partitionId: sctIdHelper.getPartition(sctid),
        checkDigit: sctIdHelper.getCheckDigit(sctid),
        systemId:guid()
};
    return sctIdRecord;
}

var getSctidBySystemId=function (namespaceId,systemId, callback) {
    var objQuery = {namespace: namespaceId, systemId: systemId};

    sctid.findBySystemId(objQuery, function (err, sctIdRecords) {
        if (err) {
            callback(err, null);
        } else {

            if (sctIdRecords && sctIdRecords.length > 0) {
                callback(null, sctIdRecords[0]);
            } else {
                callback(null, null);
            }
        }
    });
};

var generateSctid=function (operation, callback) {
    if (!operation.autoSysId) {
        getSctidBySystemId(operation.namespace, operation.systemId, function (err, sctid) {
            if (err) {
                callback(err, null);
            } else if (sctid) {

                callback(null, sctid);
            } else {
                setNewSCTIdRecord(operation, stateMachine.actions.generate, function (err, sctIdRecord) {

                    if (err) {
                        callback(err, null);
                    } else {

                        callback(null, sctIdRecord);
                    }
                });

            }
        });
    } else {
        setNewSCTIdRecord(operation, stateMachine.actions.generate, function (err, sctIdRecord) {

            if (err) {
                callback(err, null);
            } else {

                callback(null, sctIdRecord);
            }
        });
    }
};

var reserveSctid=function (operation, callback) {

    setNewSCTIdRecord(operation, stateMachine.actions.reserve, function (err, sctIdRecord) {
        if (err) {
            callback(err, null);
        } else {
            callback(null, sctIdRecord);
        }
    });
};
var registerSctid=function (operation, callback) {

    if (!operation.autoSysId) {
        getSctidBySystemId(operation.namespace, operation.systemId, function (err, sctid) {
            if (err) {
                callback(err, null);
            } else if (sctid) {
                if (sctid.sctid != operation.sctid) {
                    callback(throwErrMessage("SystemId:" + operation.systemId + " already exists with SctId:" + sctid.sctid), null);
                    return;
                }
                if (sctid.status==stateMachine.statuses.assigned) {
                    callback(null, sctid);
                }else {
                    registerNewSctId(operation, function (err, newSctId) {
                        if (err) {
                            callback(err, null);
                        } else {
                            callback(null, newSctId);
                        }
                    });
                }
            } else {
                registerNewSctId(operation, function (err, newSctId) {
                    if (err) {
                        callback(err, null);
                    } else {
                        callback(null, newSctId);
                    }
                });
            }
        });
    } else {
        registerNewSctId(operation, function (err, newSctId) {
            if (err) {
                callback(err, null);
            } else {
                callback(null, newSctId);
            }
        });

    }
};

function registerNewSctId(operation, callback){
    getSctid(operation.sctid,function(err,sctIdRecord){

        if (err) {
            callback(err, null);

        }else {

            var newStatus = stateMachine.getNewStatus(sctIdRecord.status, stateMachine.actions.register);
            if (newStatus) {
                if (operation.systemId && operation.systemId.trim() != "") {
                    sctIdRecord.systemId = operation.systemId;
                }
                sctIdRecord.status = newStatus;
                sctIdRecord.author = operation.author;
                sctIdRecord.software = operation.software;
                sctIdRecord.expirationDate = operation.expirationDate;
                sctIdRecord.comment = operation.comment;
                sctIdRecord.jobId= null;
                updateSCTIDRecord(sctIdRecord, function (err, updatedRecord) {

                    if (err) {
                        callback(err, null);
                    }else {

                        callback(null, updatedRecord);
                    }
                });
            } else {
                callback(throwErrMessage("Cannot register SCTID:" + operation.sctid + ", current status: " + sctIdRecord.status), null);
            }
        }

    });
};

var deprecateSctid=function (operation, callback){
    getSctid(operation.sctid,function(err,sctIdRecord){

        if (err) {
            callback(err, null);

        }else {

            var newStatus = stateMachine.getNewStatus(sctIdRecord.status, stateMachine.actions.deprecate);
            if (newStatus) {

                sctIdRecord.status = newStatus;
                sctIdRecord.author = operation.author;
                sctIdRecord.software = operation.software;
                sctIdRecord.comment = operation.comment;
                sctIdRecord.jobId= null;
                updateSCTIDRecord(sctIdRecord, function (err, updatedRecord) {

                    if (err) {
                        callback(err, null);
                    }else {

                        callback(null, updatedRecord);
                    }
                });
            } else {
                callback(throwErrMessage("Cannot deprecate SCTID:" + operation.sctid + ", current status: " + sctIdRecord.status), null);
            }
        }
    });
};

var releaseSctid=function (operation, callback){
    getSctid(operation.sctid,function(err,sctIdRecord){

        if (err) {
            callback(err, null);

        }else {

            var newStatus = stateMachine.getNewStatus(sctIdRecord.status, stateMachine.actions.release);
            if (newStatus) {

                sctIdRecord.status = newStatus;
                sctIdRecord.author = operation.author;
                sctIdRecord.software = operation.software;
                sctIdRecord.comment = operation.comment;
                sctIdRecord.jobId= null;
                updateSCTIDRecord(sctIdRecord, function (err, updatedRecord) {

                    if (err) {
                        callback(err, null);
                    }else {

                        callback(null, updatedRecord);
                    }
                });
            } else {
                callback(throwErrMessage("Cannot release SCTID:" + operation.sctid + ", current status: " + sctIdRecord.status), null);
            }
        }
    });
};

var publishSctid=function (operation, callback){
    getSctid(operation.sctid,function(err,sctIdRecord) {

        if (err) {
            callback(err, null);

        }else {

            var newStatus = stateMachine.getNewStatus(sctIdRecord.status, stateMachine.actions.publish);
            if (newStatus) {

                sctIdRecord.status = newStatus;
                sctIdRecord.author = operation.author;
                sctIdRecord.software = operation.software;
                sctIdRecord.comment = operation.comment;
                sctIdRecord.jobId = null;

                updateSCTIDRecord(sctIdRecord, function (err, updatedRecord) {

                    if (err) {
                        callback(err, null);
                    }else {

                        callback(null, updatedRecord);
                    }
                });
            } else {
                callback(throwErrMessage("Cannot publish SCTID:" + operation.sctid + ", current status: " + sctIdRecord.status), null);
            }
        }
    });
};
function setNewSCTIdRecord(operation,action,callback) {


    setAvailableSCTIDRecord2NewStatus(operation, action, function(err,record) {

        if (err) {
            callback(throwErrMessage("error getting available partitionId:" + operation.partitionId.toString() + " for namespace:" + operation.namespace + ", err: " + JSON.stringify(err)), null);
            return;
        } else if (record) {
            callback(null, record);
        } else {
            counterMode(operation, action,function(err,newRecord){
                if (err) {
                    callback(err, null);
                } else {
                    callback(null, newRecord);
                }
            });

        }
    });
};

function counterMode(operation, action, callback){

    getNextNumber(operation, function (err, seq) {
        if (err) {
            callback(err, null);
        } else {

            var newSCTId = computeSCTID(operation, seq);
            getSctid(newSCTId, function (err, sctIdRecord) {

                if (err) {
                    callback(err, null);

                } else {
                    var newStatus = stateMachine.getNewStatus(sctIdRecord.status, action);
                    if (newStatus) {

                        if (operation.systemId && operation.systemId.trim() != "") {
                            sctIdRecord.systemId = operation.systemId;
                        }
                        sctIdRecord.status = newStatus;
                        sctIdRecord.author = operation.author;
                        sctIdRecord.software = operation.software;
                        sctIdRecord.expirationDate = operation.expirationDate;
                        sctIdRecord.comment = operation.comment;

                        sctIdRecord.jobId = null;

                        updateSCTIDRecord(sctIdRecord, function (err, updatedRecord) {

                            if (err) {
                                callback(err, null);
                            } else {

                                callback(null, updatedRecord);
                            }
                        });
                    } else {
                        counterMode(operation, action, callback);
                    }
                }
            });
        }
    });
}

function getNextNumber( operation, callback) {
    console.log("getNextNumber " + operation.namespace + "," + operation.partitionId);
    getModel(function(err) {
        if (err) {
            callback(err, null);

        } else {
            var key = [parseInt(operation.namespace), operation.partitionId.toString()];
            partitionLockManager.lockedOperationManualRelease(key, function(releaseLockCallback) {
                model.partitions.get(key, function (err, partition) {
                    if (err) {
                        releaseLockCallback();
                        callback(throwErrMessage("error getting partition:" + operation.partitionId.toString() + " for namespace:" + operation.namespace + ", err: " + JSON.stringify(err)), null);
                        return;
                    }
                    partition.sequence++;
                    var nextNumber = partition.sequence;
                    partition.save(function (err) {
                        if (err) {
                            releaseLockCallback();
                            callback(err, null);
                        } else {
                            releaseLockCallback();
                            callback(null, nextNumber);
                        }
                    })
                 });
            });
        }
    });
};

function setAvailableSCTIDRecord2NewStatus(operation, action, callback){
    var query={namespace: parseInt(operation.namespace), partitionId:operation.partitionId, status: stateMachine.statuses.available };
    sctid.find(query ,1, null,function(err, sctIdRecords){
        if (err) {
            callback(err, null);
        }else if (sctIdRecords && sctIdRecords.length>0){
            var newStatus = stateMachine.getNewStatus(sctIdRecords[0].status, action);
            if (newStatus) {

                if (operation.systemId && operation.systemId.trim() != "") {
                    sctIdRecords[0].systemId = operation.systemId;
                }
                sctIdRecords[0].status = newStatus;
                sctIdRecords[0].author = operation.author;
                sctIdRecords[0].software = operation.software;
                sctIdRecords[0].expirationDate = operation.expirationDate;
                sctIdRecords[0].comment = operation.comment;
                sctIdRecords[0].jobId = null;
                updateSCTIDRecord(sctIdRecords[0], function (err, updatedRecord) {

                    if (err) {
                        callback(err, null);
                    } else {

                        callback(null, updatedRecord);
                    }
                });
            } else {
                counterMode(operation, action, callback);
            }
        }else {
            callback(null, null);
        }
    });
}

function updateSCTIDRecord(sctidRecord, callback) {
    sctid.save(sctidRecord,function (err,rec) {
        if (err) {
            callback(err, null);
        } else {
            callback(null, rec);
        }
    });
}

function insertSCTIDRecord(newSctidRecord, callback){

    sctid.create(newSctidRecord, function (err,rec) {
        if (err) {
            callback(err, null);
        } else {
            callback(null, rec);
        }
    });
}


function computeSCTID(operation,seq){

    var tmpNsp=operation.namespace.toString();
    if (tmpNsp=="0"){
        tmpNsp="";
    }
    var base = seq + tmpNsp + operation.partitionId;
    var SCTId = base + sctIdHelper.verhoeffCompute(base);
    return SCTId;

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

module.exports.publishSctid=publishSctid;
module.exports.releaseSctid=releaseSctid;
module.exports.deprecateSctid=deprecateSctid;
module.exports.registerSctid=registerSctid;
module.exports.generateSctid=generateSctid;
module.exports.reserveSctid=reserveSctid;
module.exports.getSctidBySystemId=getSctidBySystemId;
module.exports.getSctid=getSctid;
module.exports.getSctids=getSctids;
module.exports.checkSctid=checkSctid;

