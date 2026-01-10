const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2');
const app = express();
const PORT = process.env.PORT || 3000;
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
require('dotenv').config();
const cors = require('cors');
const crypto = require('crypto');
const e = require('express');
const axios = require("axios");
const qs = require("qs");
const jwt = require("jsonwebtoken");
const twilio = require('twilio');
const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
db.query('SELECT 1', (err, results) => {
    if (err) console.error('Error running query:', err);
    else console.log('Database is working');
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "docs")));




////////////////////////// REUSABLE FUNCTIONS //////////////////////////
async function refreshToken(refresh_token) {
    const tokenRes = await axios.post(
    "https://identity.xero.com/connect/token",
    qs.stringify({
        grant_type: "refresh_token",
        refresh_token: refresh_token,
        client_id: process.env.XERO_CLIENT_ID,
        client_secret: process.env.XERO_CLIENT_SECRET
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    return { newAccessToken: tokenRes.data.access_token, newRefreshToken: tokenRes.data.refresh_token }
}
function requireAuth(req, res, next) {
    const header = req.headers.authorization;

    if (!header){
        console.log("unauth");
        req.user = null;
        return next();
    } 

    const token = header.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
    } catch (error) {
        console.log("unauth 2")
        req.user = null;
    }
    next();
}
function requireUser(req, res, next){
    if(req.user == null){
        return res.json({ message: 'nouser' });
    }
    next();
}
function dbQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
}
async function getInvoices(accessToken, tenantId){
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const isoDate = sevenDaysAgo.toISOString().split("T")[0];
    const whereQuery = `Status=="AUTHORISED" OR Status=="PAID"`; // && AmountDue>0 && DueDate< DateTime(${isoDate})

    const invoicesRes = await axios.get(
        "https://api.xero.com/api.xro/2.0/Invoices",
        {
            headers: {
            Authorization: `Bearer ${accessToken}`,
            "Xero-tenant-id": tenantId
            },
            params: {
            where:
                whereQuery
            }
        }
    );
    return invoicesRes.data.Invoices;
}
async function getContact(accessToken, tenantId){
    const contactRes = await axios.get(
        "https://api.xero.com/api.xro/2.0/Contacts",
        {
            headers: {
            Authorization: `Bearer ${accessToken}`,
            "Xero-tenant-id": tenantId
            }
        }
    );
    return contactRes.data.Contacts || null;
}
function getCurrentDate() {
    const today = new Date();

    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const yyyy = today.getFullYear();

    return `${yyyy}-${mm}-${dd}`;
}
function daysDifference(date1, date2) { // -2 = date1 2 days BEFORE date 2
    const d1 = new Date(date1);
    const d2 = new Date(date2);

    const diffMs = d1 - d2;

    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays;
}
function getTime(){
    let currentDate = getCurrentDate();
    const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
    ];
    const todayDate = currentDate.split("-")[2] + "/" + currentDate.split("-")[1] + "/" + currentDate.split("-")[0];
    let monthTxt = months[Number(todayDate.split("/")[1]) - 1];
    let monthNum = todayDate.split("/")[0];
    let yearNum = todayDate.split("/")[2];
    const now = new Date();
    let timeString = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });
    if(Number(timeString.slice(0, 2)) > 12){
        timeString = String(Number(Number(timeString.slice(0, 2)) - 12)) + timeString.slice(2) + "pm";
    } else if(Number(timeString.slice(0, 2)) == 12){
        timeString = timeString + "pm";
    } else {
        timeString = timeString + "am";
    }
    return `${monthTxt} ${monthNum}, ${yearNum} at ${timeString}`;
}
function createNoti(userId, title, type, invoiceId){
    db.query("insert into notifications (user_id, invoice_id, title, full_date, type, status) values (?, ?, ?, ?, ?, ?)", [userId, invoiceId, title, getTime(), type, "unread"], (err, result) => {
        if(err){
            console.error(err);
        }
    });
}
async function sendSms(message, number){
    try {
        await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE,
            to: number
        });
    } catch (err) {
        console.error(err);
    }
}
function extractPhone(contact) {
    if (!contact?.Phones || contact.Phones.length === 0) return null;

    const preferred =
        contact.Phones.find(p => p.PhoneType === "MOBILE" && p.PhoneNumber) ||
        contact.Phones.find(p => p.PhoneType === "DEFAULT" && p.PhoneNumber);

    if (!preferred || !preferred.PhoneNumber) return null;

    const country = preferred.PhoneCountryCode || "";
    const area = preferred.PhoneAreaCode || "";
    const number = preferred.PhoneNumber || "";

    return `+${country}${area}${number}`.replace(/\s+/g, "");
}




////////////////////////// APIS ROUTES //////////////////////////
app.post("/api/signup", requireAuth, (req, res) => {
    const { name, email, password } = req.body;

    db.query("select * from users where email = ?", [email], (err, result) => {
        if(err){
            console.error(err);
        }

        if(result.length > 0){
            return res.json({ message: 'emailtaken' });
        }

        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if(err){
                console.error('Error hashing password:', err);
                return res.status(500).send('Error hashing password');
            }
    
            const query = 'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)';
            db.query(query, [name, email, hashedPassword], (err, result) => {
                if(err){
                    console.error('Error inserting data:', err);
                    return res.json({ message: 'failure' });
                }
    
                const payload = {
                    id: result.insertId
                };
                const token = jwt.sign(
                    payload,
                    process.env.JWT_SECRET,
                    { expiresIn: "60m" }
                );
                 
                return res.json({ message: 'success', token: token });
            });
        });
    });
});

app.post("/api/login", requireAuth, (req, res) => {
    const { email, password } = req.body;

    db.query("select * from users where email = ?", [email], (err, result) => {
        if(err){
            console.error(err);
        }

        if(result.length == 0){
            return res.json({ message: "no user" });
        }

        bcrypt.compare(password, result[0].password_hash, (err, isMatch) => {
            if(err){
                console.error("Error comparing passwords: " + err);
                return res.json({ message: 'failure' });
            }
            if(!isMatch){
                return res.json({ message: 'invalid password' });
            }

            const payload = {
                id: result[0].id
            };
            const token = jwt.sign(
                payload,
                process.env.JWT_SECRET,
                { expiresIn: "60m" }
            );
            return res.json({ message: 'success', token: token });
        });
    });
});

app.get("/api/get-user", requireAuth, requireUser, async (req, res) => {
    let users = await dbQuery("select * from users where id = ?", [req.user.id]);
    let userData = users[0];
    userData.password_hash = "";

    let invoices;
    let connections = await dbQuery("select * from connections where user_id = ?", [req.user.id]);
    if(connections.length == 0){
        return res.json({ message: 'success', connection: false });
    }
    let tenantId = connections[0].tenant_id;

    try {
        invoices = await getInvoices(connections[0].access_token, tenantId);

        db.query("select * from notifications where user_id = ? order by id desc", [req.user.id], (err, result) => {
            if(err){
                console.error(err);
            }

            let notifications = [];
            result.forEach(noti => {
                notifications.push(noti);
            });
            userData.notifications = notifications;

            db.query("select * from invoices where connection_id = ?", [connections[0].id], (err, result) => {
                return res.json({ message: 'success', connection: true, invoices: invoices, userData: userData, dbInvoices: result });
            });
        });
    } catch(err){
        if(err.response && err.response.status == 401){
            let newData = await refreshToken(connections[0].refresh_token);
            await dbQuery("update connections set access_token = ?, refresh_token = ? where id = ?", [newData.newAccessToken, newData.newRefreshToken, connections[0].id]);

            invoices = await getInvoices(newData.newAccessToken, tenantId);
            db.query("select * from notifications where user_id = ? order by id desc", [req.user.id], (err, result) => {
                if(err){
                    console.error(err);
                }

                let notifications = [];
                result.forEach(noti => {
                    notifications.push(noti);
                });
                userData.notifications = notifications;

                db.query("select * from invoices where connection_id = ?", [connections[0].id], (err, result) => {
                    return res.json({ message: 'success', connection: true, invoices: invoices, userData: userData, dbInvoices: result });
                });
            });
        } else {
            console.error(err);
            return res.json({ message: 'failure' });
        }
    }
});

app.get("/api/redirect-xero", (req, res) => {
    const params = new URLSearchParams({
        response_type: "code",
        client_id: process.env.XERO_CLIENT_ID,
        redirect_uri: process.env.XERO_REDIRECT_URI,
        scope: "accounting.transactions.read accounting.contacts.read offline_access",
        state: "secure_random_string"
    });

    const xeroUrl = "https://login.xero.com/identity/connect/authorize?" + params.toString();;
    return res.json({ message: 'success', url: xeroUrl });
});

app.post("/api/create-connection", requireAuth, async (req, res) => {
    const code = req.body.code;

    const tokenRes = await axios.post(
        "https://identity.xero.com/connect/token",
        qs.stringify({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: process.env.XERO_REDIRECT_URI
        }),
        {
        auth: {
            username: process.env.XERO_CLIENT_ID,
            password: process.env.XERO_CLIENT_SECRET
        },
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
        }
    );

    const {
        access_token,
        refresh_token,
        expires_in
    } = tokenRes.data;
    console.log(tokenRes.data);
    let expiresAt = new Date(Date.now() + expires_in * 1000);
    const tenantRes = await axios.get(
    "https://api.xero.com/connections",
    {
        headers: {
        Authorization: `Bearer ${access_token}`
        }
    }
    );
    const tenantId = tenantRes.data[0].tenantId;

    db.query("insert into connections (user_id, tenant_id, access_token, refresh_token, expires_at) values (?, ?, ?, ?, ?)", [req.user.id, tenantId, access_token, refresh_token, expiresAt], (err, result) => {
        if(err){
            console.error(err);
        }

        return res.json({ message: 'success' });
    });
});

app.get("/api/checkup", async (req, res) => {
    // check for new invoices & invoice changes -> insert DB: duedate, amountPaid, amountdue, etc
    // check if < 7 / 14 / 21 days overdue -> SMS
    // check for customer SMS replies -> AI response
    // check for payments and store data

    let contacts;
    try {
        let connections = await dbQuery("select * from connections");
        for(const con of connections){
            let xeroInvoices;
            let tenantId = con.tenant_id;
            try {
                xeroInvoices = await getInvoices(con.access_token, tenantId);
            } catch(err){
                if(err.response && err.response.status == 401){
                    let newData = await refreshToken(con.refresh_token);
                    await dbQuery("update connections set access_token = ?, refresh_token = ? where id = ?", [newData.newAccessToken, newData.newRefreshToken, con.id]);
                    xeroInvoices = await getInvoices(newData.newAccessToken, tenantId);
                } else {
                    console.error(err);
                    return res.json({ message: 'failure' });
                }
            }
    
            const dbInvoices = await dbQuery("select * from invoices where connection_id = ?", [con.id]);
    
            let currentDate = getCurrentDate();
            contacts = await getContact(con.access_token, con.tenant_id);

            let unstoredInvoices = [];
            let editedInvoices = [];
            let recoveredInvoices = [];
            xeroInvoices.forEach(xero => {
                let invoiceFound = false;
                let invoiceEdited = false;
                dbInvoices.forEach(inv => {
                    if(xero.InvoiceID == inv.xero_id){
                        invoiceFound = true;
                        if(xero.DueDateString.slice(0, 10) != inv.due_date || xero.AmountDue != inv.amount_due || xero.AmountPaid != inv.amount_paid){
                            invoiceEdited = true;
                        }
                        if(xero.AmountDue == 0 && inv.amount_due != 0){
                            if(daysDifference(xero.DueDateString.slice(0, 10), currentDate) <= -7){
                                recoveredInvoices.push(xero);
                                createNoti(con.user_id, `Invoice #${xero.InvoiceNumber.split("-")[1] || 9402} has been recovered!`, "paid", inv.id);
                            }
                        }

                        let newPhone;
                        contacts.forEach(contact => {
                            if(contact.ContactID == xero.Contact.ContactID) newPhone = extractPhone(contact);
                        });
                        if(newPhone && newPhone != !inv.phone_number){
                            editedInvoices.push(xero);
                        }
                    }
                });
                if(!invoiceFound){
                    unstoredInvoices.push(xero);
                } else if(invoiceEdited){
                    editedInvoices.push(xero);
                }
            });
            
            for(const xero of unstoredInvoices){
                let phoneNumber;
                contacts.forEach(contact => {
                    if(contact.ContactID == xero.Contact.ContactID) phoneNumber = extractPhone(contact);
                });
                await dbQuery("insert into invoices (xero_id, connection_id, due_date, amount_due, amount_paid, phone_number) values (?, ?, ?, ?, ?, ?)", [xero.InvoiceID, con.id, xero.DueDateString.slice(0, 10), xero.AmountDue, xero.AmountPaid, phoneNumber]);
            }
            for(const xero of editedInvoices){
                let phoneNumber;
                contacts.forEach(contact => {
                    if(contact.ContactID == xero.Contact.ContactID) phoneNumber = extractPhone(contact);
                });
                await dbQuery("update invoices set due_date = ?, amount_due = ?, amount_paid = ?, phone_number = ? where xero_id = ?", [xero.DueDateString.slice(0, 10), xero.AmountDue, xero.AmountPaid, phoneNumber, xero.InvoiceID]);
            }
            for(const xero of xeroInvoices){
                let xeroDueDate = xero.DueDateString.slice(0, 10);
                if(xero.AmountDue != 0){
                    for(const inv of dbInvoices){
                        if(inv.xero_id == xero.InvoiceID && inv.cancelled == "no"){
                            if(daysDifference(xeroDueDate, currentDate) <= -7 && inv.sms_stage < 1){
                                for(const contact of contacts){
                                    if(contact.ContactID == xero.Contact.ContactID){
                                        let phoneNumber = extractPhone(contact);
                                        console.log("SMS 1: " + phoneNumber + " - " + xero.Contact.Name);

                                        if(phoneNumber){
                                            await dbQuery("update invoices set sms_stage = ? where id = ?", [1, inv.id]);
                                            await dbQuery("insert into messages (xero_invoice_id, heading, para, type, date, customer_phone) values (?, ?, ?, ?, ?, ?)", [inv.xero_id, "Initial Warning", "Your invoice for Dyson's is 7 days overdue.", "warning", getCurrentDate(), phoneNumber])
                                            // await sendSms("Your invoice for Dyson's is 7 days overdue.", phoneNumber);
                                            createNoti(con.user_id, `A message was sent to ${xero.Contact.Name}. (7 days overdue)`, "sms", inv.id);
                                        } else {
                                            db.query("select * from notifications where title = ?", [`No phone number found on Xero for ${xero.Contact.Name}. (7 days overdue)`], (err, result) => {
                                                if(err){
                                                    console.error(err);
                                                }

                                                if(result.length == 0){
                                                    createNoti(con.user_id, `No phone number found on Xero for ${xero.Contact.Name}. (7 days overdue)`, "error", inv.id);
                                                }
                                            });
                                        }
                                    }
                                }
                            } else if(daysDifference(xeroDueDate, currentDate) <= -14 && inv.sms_stage < 2){
                            } else if(daysDifference(xeroDueDate, currentDate) <= -21 && inv.sms_stage < 3){
                            }
                        }
                    }
                }
            }
            for(const xero of recoveredInvoices){
                await dbQuery("update invoices set recovered = ? where xero_id = ?", ["yes", xero.InvoiceID]);
            }
        }
        return res.json({ message: 'success', contacts: contacts });
    } catch(err){
        console.error(err);
        return res.json({ message: 'failure' });
    }
});

app.post("/api/mark-read", requireAuth, (req, res) => {
    db.query("update notifications set status = ? where user_id = ?", ["read", req.user.id], (err, result) => {
        if(err){
            console.error(err);
        }

        return res.json({ message: 'success' });
    });
});

app.post("/api/reply", (req, res) => {
    const from = req.body.From;
    const body = req.body.Body;

    db.query("select * from messages where customer_phone = ?", [from], (err, result) => {
        if(err){
            console.error(err);
        }

        if(result.length == 0){
            console.log("Reply from unknown phone number?");
            return res.json({ message: 'unknownreply' });
        }

        let xeroId = result[0].xero_invoice_id;
        db.query("insert into messages (xero_invoice_id, heading, para, type, date, customer_phone) values (?, ?, ?, ?, ?, ?)", [xeroId, "Customer Response", body, "response", getCurrentDate(), from], (err, result) => {
            if(err){
                console.error(err);
            }

            db.query("select * from invoices where xero_id = ?", [xeroId], (err, result) => {
                if(err){
                    console.error(err);
                }

                if(result[0] && result[0].cancelled == "no"){
                    let intents = [
                        ["paid", "i paid", "payment sent", "sent payment", "done"],
                        ["forgot", "will pay", "later", "tomorrow", "will send", "can pay"],
                        ["can't", "cant", "no money", "don't have", "broke", "won't", "not able"],
                        ["how much", "amount", "why", "what is"]
                    ];
    
                    let messages = [
                        "Thank you for paying.",
                        "Okay, no worries at all, I will keep in touch.",
                        "I understand, please try to make the payment soon.",
                        "This invoice has an outstanding balance of £" + result[0].AmountDue,
                        "Thanks for the message, please state clearly how you'd like to proceed." // no match
                    ];
                    let count = [0, 0, 0, 0];
                    let highest = 0;
                    let winnerIdx = 0;
                    intents.forEach((int, idx) => {
                        int.forEach(word => {
                            if(body.toLowerCase().includes(word.toLowerCase())){
                                count[idx]++;
                            }
                        });
                        if(count[idx] > highest){
                            highest = count[idx];
                            winnerIdx = idx;
                        }
                    });
    
                    if(highest == 0) winnerIdx = 4;
                    sendSms(messages[winnerIdx], from);
    
                    let conId = result[0].connection_id;
                    let invoiceId = result[0].id;
                    db.query("insert into messages (xero_invoice_id, heading, para, type, date, customer_phone) values (?, ?, ?, ?, ?, ?)", [xeroId, "AI Response", messages[winnerIdx], "airesponse", getCurrentDate(), from], (err, result) => {
                        if(err){
                            console.error(err);
                        }
    
                        db.query("select * from connections where id = ?", [conId], (err, result) => {
                            if(err){
                                console.error(err);
                            }
        
                            createNoti(result[0].user_id, `We received an SMS reply from ${from}`, "response", invoiceId);
                            createNoti(result[0].user_id, `We sent an AI response to ${from}`, "response", invoiceId);
                            return res.json({ message: 'success' });
                        });
                    });
                }
            });
        });
    });
});

app.post("/api/get-chats", requireAuth, (req, res) => {
    const xeroId = req.body.xeroId;

    db.query("select * from messages where xero_invoice_id = ?", [xeroId], (err, result) => {
        if(err){
            console.error(err);
        }

        return res.json({ messages: result });
    });
});

app.post("/api/toggle-exclusion", (req, res) => {
    db.query("update invoices set cancelled = ? where id = ?", [req.body.newValue, req.body.id], (err, result) => {
        if(err){
            console.error(err);
        }

        return res.json({ message: 'success' });
    });
});




app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});