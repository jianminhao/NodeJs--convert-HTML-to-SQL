/*
 *  importJson2HTML.js    - import Json file into SQL statement.
 * 	Description: This program will look for pxx.json 
 *  	and load the data to tables (generate the insert SQL). 
 * 
 * 	Author: jbu
 * 
 *  Versions:
 *  11-05-18    jwang   1.0.1 - This program will pass json files in folder and insert into database.
 *  11-12-18    jwang   1.0.2 - Add support group 2 file to another table. 
 */

var version = "1.0.2";
process.chdir(__dirname); //make sure the working dir is correct

//================================================================================
// Include headers and globally accessible class variables
//================================================================================
var fs = require("fs");
var path = require("path");
var jsdom = require("jsdom");
var os = require("os"); // Basic OS API

//================================================================================
// Globally available variables used to control process logic
//================================================================================
//var debug = true;
var debug = false;
var QCDocRoot = "";
var LogDocRoot = "";
var outFilePath;
var oldProcessedFiles = [];
var newProcessedFiles = [];

// type c: ptable Group 2 column list, used to check if there are new columns needed.
var oldColumnList_r2 = [];
var newColumnList_r2 = [];

// Update SQL list
var updateSqlList = [];

// Current datetime used to write log and sql
var d = new Date();
var dateString = d.getFullYear() + "" + (d.getMonth() + 1) + "" + d.getDate() + "" + d.getHours() + d.getMinutes();

//================================================================================
// Start main process
//================================================================================

// Read parameter: Folder to be processed
loadParameters(function(isSuccess) {
	if (!isSuccess) {
		console.error(path.basename(__filename) + " Version " + version);
		console.error("Usage: node " + path.basename(__filename) + " -r [qcrootPath] ");
		console.error("Description :");
		console.error("\tParse Json file .");
		console.error("");
		console.error("Parameters :");
		console.error("\t-r qcrootPath : required, root folder . \t -l Log and generated SQL directory. If not specifiied, use the first directory");

		process.exit(1);
	}
});
if (debug) {
	QCDocRoot = "C:\\Test";
}
if (QCDocRoot.length < 1) {
	console.error("ERROR: -l  QCDocRoot is required.");
	process.exit(1);
}

if (LogDocRoot.length < 1) {
	LogDocRoot = QCDocRoot;
}

var logFilePath = LogDocRoot + "/log" + dateString + ".txt";
var processedFileName = LogDocRoot + "/processed" + ".txt";

// Read Processed folder list
InitProcessed();

importJson(QCDocRoot);

//================================================================================
// Finished the program
//================================================================================

//================================================================================
// Process function. Check folders, subfolders and then process files base on ite type.
//================================================================================
function importJson(rootPath) {
	getDirsSync(rootPath).forEach(function(fdr) {
		var runFolder = fdr;
		var runFolderPath = path
			.join(rootPath, runFolder)
			.trim()
			.replace(/[\/\\]/g, "/");

		// Check if it is already inside processed file. If yes, skip. Otherwise insert in the list.
		//if (isProcessed(fdr)) {
		//	log("Skip processed: " + runFolderPath);
		//} else
		if (runFolder.match(/combine/)) {
			// Skip combined folder
			log("Skip Combined: " + runFolderPath);
		} else {
			//newProcessedFiles.push(fdr);

			getDirsSync(runFolderPath).forEach(function(libFolder) {
				var processLibFolder = fdr + "/" + libFolder;

				if (isProcessed(processLibFolder)) {
					log("Skip processed: " + processLibFolder);
				} else {
					newProcessedFiles.push(processLibFolder);
					//each lib folder
					var libFolderPath = path
						.join(runFolderPath, libFolder)
						.trim()
						.replace(/[\/\\]/g, "/");
					var files = getFilesSync(libFolderPath);
					var tmpFile;
					for (i = 0; i < files.length; i++) {
						if (files[i].match(/.json/)) {
							var libFilePath = path
								.join(libFolderPath, files[i])
								.trim()
								.replace(/[\/\\]/g, "/");
							try {
								parsemapping(libFilePath, "r2", runFolder, libFolder;
							} catch (e) {
								log("Problems happened:" + libFilePath + e.message);
							}
						}
					}
				}
			});
		}
	});
	// Write New processed folders to processed file.
	try {
		fs.appendFileSync(processedFileName, newProcessedFiles.join("\n") + "\n");
		log("New Processed folders: " + newProcessedFiles.join("\n"));
	} catch (e) {
		log("Append File failed: " + processedFileName + e.message);
		process.exit(1);
	}
	// Write Found New columns for each table.
	setTimeout(function() {
		log("2 table need to add columns: " + newColumnList_r2.join(","));
	}, 1000);
}

//================================================================================
// File Parsing function. Check HTML table tag, find header as clolumn name and data
// to generate SQL.
//================================================================================
function parsemapping(inFilePath, fileType, roundID, libID) {
	var htmlSource;
	htmlSource = fs.readFileSync(inFilePath, "utf8");
	//log('Parsing started...' + inFilePath);

	var tableName = getTableName(fileType);
	var sqlContents = "";

	var parsedCurrObj = JSON.parse(htmlSource);
	var libraryID = parsedCurrObj.libraryID;

	//forEach record (row)
	var List = parsedCurrObj["Picard QC metrics by accession and panel"];
	var nRowID = 0;
	List.forEach(function(sep) {
		var columnNames = [];
		var rowData = [];
		var colunmString = "";

		nRowID++;
		var acc = sep.accessionID;
		var panel = sep.panels[0].panel;
		var metrics = sep.panels[0].metrics[0];

		for (var key in metrics) {
			var newColumnName = key.trim().replace(/[&\/\\#,+()$~%.'":*?<>={}\[\]]/g, "");
			newColumnName = newColumnName
				.trim()
				.replace(/[ ]/g, "")
				.substring(-30);

			if (!columnNames.includes(newColumnName)) columnNames.push(newColumnName);

			// Column Test is to determine if new columns is needed, so table need to be altered.
			NewColumnTest(newColumnName, fileType);
			rowData.push("'" + metrics[key] + "'");
		}
		if (columnNames.length != rowData.length) {
			log("columns.length != rowData.length! " + columnNames.length + " vs " + rowData.length + inFilePath);
		} else {
			if (columnNames.length > 0) {
				
				colunmString = columnNames.join(",");
			}
			rowSql = rowData.join(",");

			
			var OneFullSql = "INSERT INTO " + tableName + " (" + colunmString + ") VALUES (" + rowSql + ");\n";
			sqlContents += OneFullSql;

			// Generate Update SQL
			GenerateUpdateSQL(roundID, libID, tableName);
		}
	});
	var outFilePath = LogDocRoot + "/insert_" + dateString + ".sql";
	try {
		fs.appendFileSync(outFilePath, sqlContents);
	} catch (e) {
		log("Write Insert SQL error" + e.message);
	}
	log("Process done: " + inFilePath);
}


function InitProcessed() {
	log("===========================================================");
	log(" Import QC Data Version " + version);
	log("===========================================================");
	log("INFO: Running Host:" + os.hostname());

	log(path.basename(__filename) + " Version " + version);
	log(d.toLocaleDateString() + " " + d.toLocaleTimeString());

	var fileContent = "";
	try {
		fileContent = fs.readFileSync(processedFileName, "utf8");
	} catch (e) {
		log("Process file not exist: " + processedFileName);
	}
	oldProcessedFiles = fileContent.split("\n");
}

function isProcessed(folderName) {
	if (oldProcessedFiles.includes(folderName)) return 1;
	else return 0;
}
