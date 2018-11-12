/*
 *  importHTML2Sql.js    - import HTML table into SQL statement.
 * 	Description: This program will look for pxx.html
 *  	and load the data to tables (generate the insert SQL). 
 * 
 * 	Author: jwang
 * 
 *  Versions:
 *  10-17-18    jwang   1.0.0 - Generate SQL file from HTML files
 *  10-24-18    jwang   1.0.1 - Changed code to support 2 tables
 *  10-25-18    jwang   1.0.2 - Add log dir
 *  10-25-18    jwang   1.0.3 - Changed the process Dir to be 2 levels instead of 1 level. 
 *  11-01-18    jwang   1.0.4 - Add update SQL for merged case.
 */

var version = "1.0.4";
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
var sLog = "";
var QCDocRoot = "";
var LogDocRoot = "";
var outFilePath;
var gwindow = null;
var oldProcessedFiles = [];
var newProcessedFiles = [];

// type p: p table column list, used to check if there are new columns needed.
var oldColumnList_p = [
];
var newColumnList_p = [];

// Update SQL list
var updateSqlList = [];
var mergeFlag = 0;

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
		console.error("\tParse HTML file to SQL.");
		console.error("");
		console.error("Parameters :");
		console.error("\t-r qcrootPath : required, root folder for HTML. \t -l Log and generated SQL directory. If not specifiied, use the first directory");

		process.exit(1);
	}
});
if (debug) {
	QCDocRoot = "C:\\test\\";
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

importSasQcMatrix(QCDocRoot);

//================================================================================
// Finished the program
//================================================================================

//================================================================================
// Process function. Check folders, subfolders and then process files base on ite type.
//================================================================================
function importSasQcMatrix(rootPath) {
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
						if (files[i].match(/.html/)) {
							var libFilePath = path
								.join(libFolderPath, files[i])
								.trim()
								.replace(/[\/\\]/g, "/");
							try {
									parsemapping(libFilePath, "p", runFolder, libFolder);
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
		log("table need to add columns: " + newColumnList_p.join(","));
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

	call_jsdom(htmlSource, function(window) {
		var columnNames = [];
		var colunmString = "";
		var columnCreateSql = [];

		gwindow = window;
		var $ = gwindow.$;
		var i = 0;

		// Check if there are multiple tables in the doc, only process one table
		var tableNo = $("table").length;
		if (tableNo > 3) {
			log("MultiTable, skip: " + inFilePath);
		} else {
			var $OneTable = $("table")[0];

			// Process Header <table thead tr> style
			// Find Columns list, replace special charactor and keep the last 30 charactors
			var nTable = 0;
			$("table").each(function() {
				nTable++;
				if (nTable === 1) {
					$(this)
						.find("thead tr")
						.each(function() {
							$(this)
								.find("td")
								.each(function() {
									var text = $(this).text();
									if (!(text.substring(0, 4) === "Read")) {
										// Only process the first line, ignore the Line that shows Read 1, read 2
										var newColumnName = text.trim().replace(/[&\/\\#,+()$~%.'":*?<>={}\[\]]/g, "");

										// In case the colspan = 2, add two columns instead of add one column
										if ($(this).attr("colspan") > 1) {
											newColumnName = newColumnName
												.trim()
												.replace(/[ ]/g, "")
												.substring(-28);
											columnNames.push(newColumnName + "_1");
											columnNames.push(newColumnName + "_2");
											columnCreateSql.push(newColumnName + "_1 varchar(100)");
											columnCreateSql.push(newColumnName + "_2 varchar(100)");

											// Column Test is to determine if new columns is needed, so table need to be altered.
											NewColumnTest(newColumnName + "_1", fileType);
											NewColumnTest(newColumnName + "_2", fileType);
										} else {
											newColumnName = newColumnName
												.trim()
												.replace(/[ ]/g, "")
												.substring(-30);
											columnNames.push(newColumnName);
											columnCreateSql.push(newColumnName + " varchar(100)");

											// Column Test is to determine if new columns is needed, so table need to be altered.
											NewColumnTest(newColumnName, fileType);
										}
									}
								});
						});
				}
			});

			// Below are for Create Table SQL use only.
			//var columnCreateSqls = columnCreateSql.join(",");
			//var createTableSql = "CREATE TABLE " + tableName + "(" + columnCreateSqls + ");";
			//log(createTableSql);

			// Find Data
			var linecount = 0;
			var nRowID = 1;
			var OneDataSql = "";
			var secondTableFlag = 0;

			$("table tbody tr").each(function() {
				linecount++;

				var rowSql;
				var rowData = [];
				var lane = " ";

				// There is chance the header is inside tBody. In this case, find the header row from the data and skip the first line in the row part.
				if (columnNames.length === 0 && linecount === 1) {
					$(this)
						.find("td")
						.each(function() {
							if ($(this).hasClass("thead")) {
								var text = $(this).text();
								var newColumnName = text.trim().replace(/[&\/\\#,+()$~%.'":*?<>={}\[\]]/g, "");
								newColumnName = newColumnName
									.trim()
									.replace(/[ ]/g, "")
									.substring(-30);
								columnNames.push(newColumnName);
								//columnCreateSql.push( newColumnName + ' varchar(100)');

								NewColumnTest(newColumnName, fileType);
							}
						});
					if (columnNames.length > 0) {
						columnNames.push("RowNo");
						columnNames.push("DateInsert");
						columnNames.push("RoundID");
						columnNames.push("LibID");

						colunmString = columnNames.join(",");

						// Below are for Create Table SQL use only.
						//var columnCreateSqls = columnCreateSql.join(",");
						//var createTableSql = "CREATE TABLE " + tableName + "(" + columnCreateSqls + ");";
						//log(createTableSql);
					}
				} else {
					// For regular data, process below
					$(this)
						.find("td")
						.each(function() {
							var text = $(this).text();
							var newColumnValue = text.trim();
							rowData.push("'" + newColumnValue + "'");
						});

					//Validate the data with column, Since column pushed additional 4 columns, so +4
					//In case there are two tables in one file, it will go into this code, ignore
					//if (secondTableFlag === 0) {
					if (columnNames.length != rowData.length ) {
						log("columns.length != rowData.length! " + columnNames.length + " vs " + rowData.length + inFilePath);
					} else {
						rowSql = rowData.join(",");
						if (rowSql.match(/SpecialString/)) {
							log("A Second table that contains title" + rowData + inFilePath);
						} else {
							rowSql += ", " + nRowID + ", SYSDATE, '" + roundID + "', '" + libID + "'";
							OneFullSql = "INSERT INTO " + tableName + " (" + colunmString + ") VALUES (" + rowSql + ");\n";
							sqlContents += OneFullSql;
						}
					}
					//}
					nRowID++;
				}
			});

			//log("Sql Contents: " + sqlContents);		finalSql += sqlContents;
			//outFilePath = LogDocRoot + "\\insert_" + tableName + "_" + dateString + ".sql";
			outFilePath = LogDocRoot + "/insert_" + dateString + ".sql";
			try {
				fs.appendFileSync(outFilePath, sqlContents);
			} catch (e) {
				log("Write Insert SQL error" + e.message);
			}
			log("Process done: " + inFilePath);
		}
	});
}


//================================================================================
// Check if there are new columns need to be added to existing table
//================================================================================
function NewColumnTest(colName, fileType) {
	switch (fileType) {
		case "m":
			if (oldColumnList_m.includes(colName)) return;
			if (newColumnList_m.includes(colName)) return;
			newColumnList_m.push(colName);
			break;
		case "p":
			if (oldColumnList_p.includes(colName)) return;
			if (newColumnList_p.includes(colName)) return;
			newColumnList_p.push(colName);
			break;
		case "v":
			if (oldColumnList_v.includes(colName)) return;
			if (newColumnList_v.includes(colName)) return;
			newColumnList_v.push(colName);
			break;
		case "c":
			if (oldColumnList_c.includes(colName)) return;
			if (newColumnList_c.includes(colName)) return;
			newColumnList_c.push(colName);
			break;
		case "r":
			if (oldColumnList_r.includes(colName)) return;
			if (newColumnList_r.includes(colName)) return;
			newColumnList_r.push(colName);
			break;
	}
}

//================================================================================
// JQuery process call
//================================================================================
function call_jsdom(source, callback) {
	var JQUERY_PATH = "." + path.sep + "node_modules" + path.sep + "jquery" + path.sep + "dist" + path.sep + "jquery.min.js";
	jsdom.env(source, [JQUERY_PATH], function(errors, window) {
		process.nextTick(function() {
			if (errors) {
				throw new Error("There were errors: " + JSON.stringify(errors, null, 2));
			}
			callback(window);
		});
	});
}

function log(msg) {
	sLog += msg + "\n";
	console.log(msg);
	try {
		fs.appendFileSync(logFilePath, msg + "\n");
	} catch (e) {
		console.error(e.message);
		process.exit(1);
	}
}

function getDirsSync(srcpath) {
	try {
		return fs.readdirSync(srcpath).filter(function(file) {
			return fs.statSync(path.join(srcpath, file)).isDirectory();
		});
	} catch (e) {
		log("ERROR: getDirsSync" + srcpath + e.message);
	}
	return [];
}

function getFilesSync(srcpath) {
	try {
		return fs.readdirSync(srcpath).filter(function(file) {
			return fs.statSync(path.join(srcpath, file)).isFile();
		});
	} catch (e) {
		log("ERROR: getFilesSync: " + srcpath + e.message);
	}
	return [];
}

function loadParameters(callback) {
	if (!debug && process.argv.length < 4) return callback(false);

	var p1 = process.argv[2];
	QCDocRoot = process.argv[3];

	var p2 = process.argv[4];
	if (process.argv[5]) LogDocRoot = process.argv[5];

	if (p1 === "-h") return callback(false); //Show Help
	if (p1 === "-r") return callback(true); // Correct

	return callback(false);
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
