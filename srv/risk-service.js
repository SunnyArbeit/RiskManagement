// Imports 
const cds = require("@sap/cds");

/** The service implementation with all service handlers */
module.exports = cds.service.impl(async function () {
    // Define constants for the Risk and BusinessPartners entities from the risk-service.cds file 
    const { Risks, BusinessPartners } = this.entities;


    /* temporaer as per CLD200 - CLD200_Extension Suite.pdf page 101 Error handling
    Custom error handler
    throw a new error with: throw new Error('something bad happened');
    
    23/02/2022: commented out, otherwise cannot see "Forbidden" error in exercise unit 6-exercise 6
    Define Restrictions and Roles in  
    
    this.on("error", (err, req) => {
        err.message = "Error in risk-service.js" + err.message;
    });
    */


    /**
     * Set criticality after a READ operation on /risks
     * */
    this.after("READ", Risks, (data) => {
        const risks = Array.isArray(data) ? data : [data];

        //17/02/2022: same issue like below if no data yet
        //Since I don't know how to fix it I will just exit
        /*
        console.log(typeof risks);
        console.log("risk-service.js:manual exit before crash in risks.forEach((risk)-->empty Risks");
        if (data){
            console.log("risks not empty");
        }
        else {
            console.log("risks ist empty");
        };
        return;
        */

        //https://www.codeproject.com/Articles/182416/A-Collection-of-JavaScript-Gotchas#nullundefined
        if (data) {  

            risks.forEach((risk) => {
                if (risk.impact >= 100000) {
                    risk.criticality = 1;
                } else {
                    risk.criticality = 2;
                }
            });

        };


    });

    // connect to remote service
    const BPsrv = await cds.connect.to("API_BUSINESS_PARTNER");

    /** * Event-handler for read-events on the BusinessPartners entity. 
     * * Each request to the API Business Hub requires the apikey in the header.    
    */
    this.on("READ", BusinessPartners, async (req) => {
        // The API Sandbox returns alot of business partners with empty names. 
        // We don't want them in our application 
        req.query.where("LastName <> '' and FirstName <> '' ");

        return await BPsrv.transaction(req).send({
            query: req.query, headers: {
                apikey: process.env.apikey,
            },
        });
    });

    /** * Event-handler on risks. * Retrieve BusinessPartner data from the external API */
    this.on("READ", Risks, async (req, next) => {

        /* 17/02/2022: in BAS Debug it shows that there is no "columns" in statement "req.query.SELECT.columns.findIndex"
         this cause the following error if click on "Risks"
        [cds] - TypeError: Cannot read properties of undefined (reading 'findIndex')
        in Browser (i.e. access the prod URL) it shows the error:
        502 Bad Gateway: Registered endpoint failed to handle the request
        
        Since I don't know how to fix it I will just exit
        
        console.log("risk-service.js:manual exit before crash in req.query.SELECT.columns.findIndex-->no columns");

        */
        const columns = req.query.SELECT.columns;

        /*
        if (columns) {
            console.log("columns is not empty");
        }
        else {
            console.log("columns is empty");
        };
        return;
        */

        //17/02/2022: avoid crash issue --> add if 
        /* Check whether the request wants an "expand" of the business partner As this is not possible, the risk entity and the business partner entity are in different systems (SAP BTP and S/4 HANA Cloud), if there is such an expand, remove it */
        if (columns) {    

            const expandIndex = req.query.SELECT.columns.findIndex(
                ({ expand, ref }) => expand && ref[0] === "bp");
            console.log(req.query.SELECT.columns);
            if (expandIndex < 0) return next();

            req.query.SELECT.columns.splice(expandIndex, 1);
            if (
                !req.query.SELECT.columns.find((column) => column.ref.find((ref) => ref == "bp_BusinessPartner")
                )
            ) {
                req.query.SELECT.columns.push({ ref: ["bp_BusinessPartner"] });
            }


            /* Instead of carrying out the expand, issue a separate request for each business partner This code could be optimized, instead of having n requests for n business partners, just one bulk request could be created */

            try {
                const res = await next();
                await Promise.all(res.map(async (risk) => {
                    const bp = await BPsrv.transaction(req).send({
                        query: SELECT.one(this.entities.BusinessPartners).where({ BusinessPartner: risk.bp_BusinessPartner }).columns(["BusinessPartner", "LastName", "FirstName"]),
                        headers: {
                            apikey: process.env.apikey,
                        },
                    });
                    risk.bp = bp;
                })
                );
            } catch (error) { }

        };
    });


});