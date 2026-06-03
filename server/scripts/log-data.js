
let yesterdayseed;

function getLogData(){

    getYesterdaySeed();

}

function getYesterdaySeed(){
   
    yesterdayseed = readCSV("server/logs/seedList.csv", 0, 0);
    yesterdayseedDate = readCSV("server/logs/seedList.csv", 0, 1);

    if(yesterdayseedDate !== toUtcDateString(new Date(Date.now() - 864e5))) {
        yesterdayseed = 'WRONG WRONG FUCKING WRONG TEST FAIL WRONG WRONG WRONG';
        console.error("Unable to test the seed data");
    }

    console.log(`Yesterday's seed: ${yesterdayseed}`);
}

function readCSV(table, row, columns) {
    
    /* get file info and break 
    
    */
}

