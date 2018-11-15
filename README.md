# NodeJs-Util - Convert HTML to Oracle SQL Statements
Utilities I developed for managing files and databases. 

1. Import HTML to Oracle database insert SQL Statements. 

Input: folder Name, which contains HTML files in second level subfolder.
Output: insert SQL statement (Oracle Style). 
Calling method: ImportHTML2SQL -r rootPath -l Logpath 
    rootPath: required, root folder for HTML. 
    LogPath: optional, if not specified, will use rootpath.

This program is written in NodeJS javascript, it uses JQuery to parse HTML file.

Running this program will generate two files: insert_date.sql and processed.txt. Eachtime you run the program, it will check the processed.txt to see whether a folder is processed or not. If it is processed, this program will skip processing it. 

Sample HTML file: 
  
<h4>Test HTML</h4>
<table class="Table">
<tbody>
<tr>
<td class="thead">ID</td>
<td class="thead">Reads</td>
<td class="thead">Duplicates</td>
<td class="thead">Total</td>
<td class="thead">Unique Mapped</td>
<td class="thead">Unmapped</td>
<td class="thead">Mapped</td>
<td class="thead"><b>Mean</b></td>
</tr>
<tr>
<td>A110812</td>
<td>733,921,704 (100.00%)</td>
<td>6.38%</td>
<td>687,115,097</td>
<td>93.87%</td>
<td>5.74%</td>
<td>92.117</td>
<td>29.76 x</td>
</tr>
</table>

Output: 

INSERT INTO test_table (ID,Reads,Duplicates,Total,Unique_Mapped,Unmapped,mapped,Mean)
VALUES 
('A110812','733,921,704 (100.00%)', '6.38%', '687,115,097', '93.87%', '5.74%', '92.117', '29.76 x' );
