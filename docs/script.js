

const gitName = "";
let url = "https://servers.nextdesignwebsite.com/invoiceapp";
if(window.location.href.includes("localhost")){
    url = "";
}
let params = new URLSearchParams(window.location.search);

document.querySelectorAll(".modal-modal").forEach(modal => {
    modal.addEventListener("click", (e) => {
        if(!modal.querySelector(".modal-wrapper").contains(e.target)){
            modal.style.opacity = "0";
            modal.style.pointerEvents = "none";
            if(modal.classList.contains("chat-modal")){
                document.querySelector(".det-modal").style.opacity = "1";
                document.querySelector(".det-modal").style.pointerEvents = "auto";
            }
        }
    });
    modal.querySelector(".modal-xmark").addEventListener("click", () => {
        modal.style.opacity = "0";
        modal.style.pointerEvents = "none";
        if(modal.classList.contains("chat-modal")){
            document.querySelector(".det-modal").style.opacity = "1";
            document.querySelector(".det-modal").style.pointerEvents = "auto";
        }
    });
});

function convertDateFormat(date){
    let cut = date.slice(0, 10);
    cut = `${cut.split("-")[2]}/${cut.split("-")[1]}/${cut.split("-")[0]}`;
    return cut;
}

function getCurrentDate() {
    const today = new Date();

    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const yyyy = today.getFullYear();

    return `${yyyy}-${mm}-${dd}`;
}
let currentDate = getCurrentDate();

function daysDifference(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);

    const diffMs = d1 - d2;

    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays;
}

async function getUser(){
    async function checkup(){
        try {
            const response = await fetch(`${url}/api/checkup`, {
                method: 'GET',
                credentials: 'include',
                headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
            });
            const data = await response.json(); 
            if(data.message == "success"){
                localStorage.setItem("lastCheck", currentDate);
                console.log("checked");
                console.log(data.contacts);
                window.location.reload();
            } else {
                window.location.href = "/login.html";
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    }
    if((!localStorage.getItem("lastCheck") || localStorage.getItem("lastCheck") != currentDate) && !document.querySelector(".signup") && !document.querySelector(".login")){   
        await checkup();
    }

    try {
        const response = await fetch(`${url}/api/get-user`, {
            method: 'GET',
            credentials: 'include',
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        const data = await response.json(); 
        let userData;
        if(data.message == "success"){
            userData = data.userData;
        } else {
            if(!document.querySelector(".signup") && !document.querySelector(".login")){
                window.location.href = "/login.html";
            }
        }


        if(document.querySelector(".home")){
            document.querySelector(".home-name").textContent = userData.name;
            document.querySelector(".home-pfp").addEventListener("click", () => {
                localStorage.clear();
                window.location.href = "/login.html";
            });

            if(!data.connection){
                document.querySelector(".con-modal").style.opacity = "1";
                document.querySelector(".con-modal").style.pointerEvents = "auto";
            } 
            else {
                let dashData = {
                    "recovered": 0,
                    "recoveredList": [],
                    "waiting": 0,
                    "overdue": 0
                }

                let xeroInvoices = data.invoices.reverse();
                console.log(xeroInvoices);
                xeroInvoices.forEach(invoice => {
                    let dbInvoice;
                    data.dbInvoices.forEach(dbInv => {
                        if(dbInv.xero_id == invoice.InvoiceID){
                            dbInvoice = dbInv;
                        }
                    });
                    if(!dbInvoice){
                        checkup();
                    }
                    const phoneString = dbInvoice.phone_number;

                    let newWrapper = document.createElement("div");
                    newWrapper.classList.add("home-inv-wrapper");
                    newWrapper.id = "dbinv-" + dbInvoice.id;
                    let statusStr = '<div class="home-inv-status home-inv-status-recovered">Recovered</div>';
                    let status = "Recovered";
                    if(invoice.AmountDue != 0){
                        statusStr = '<div class="home-inv-status home-inv-status-pending">Pending</div>';
                        status = "Pending";
                        if(daysDifference(invoice.DueDateString.slice(0, 10), currentDate) < 0){
                            statusStr = '<div class="home-inv-status home-inv-status-past-due">Past due</div>';
                            status = "Past due";
                            dashData.waiting += invoice.AmountDue;
                            dashData.overdue++;
                        }
                    }
                    if(dbInvoice.cancelled == "yes"){
                        statusStr = '<div class="home-inv-status home-inv-status-cancelled">Excluded</div>';
                        status = "Cancelled";
                    }
                    if(dbInvoice.recovered == "yes"){
                        dashData.recovered += invoice.Total;
                        dashData.recoveredList.push(invoice.Total);
                    }
                    newWrapper.innerHTML = `
                        <div>
                            <div class="home-inv-name">${invoice.Contact.Name}</div>
                            <div class="home-inv-date">Due ${convertDateFormat(invoice.DueDateString)}</div>
                        </div>
                        <div>
                            <div class="home-inv-price">£${invoice.Total.toFixed(2)}</div>
                            ${statusStr}
                        </div>
                    `;
                    if((invoice.AmountDue != 0 && daysDifference(invoice.DueDateString.slice(0, 10), currentDate) < 0) || dbInvoice.recovered == "yes"){
                        document.querySelector(".home-inv-col").appendChild(newWrapper);
                    }

                    newWrapper.addEventListener("click", () => {
                        document.querySelector(".det-modal").style.opacity = "1";
                        document.querySelector(".det-modal").style.pointerEvents = "auto";

                        document.querySelector(".det-wrapper").innerHTML = `
                            <i class="fa-solid fa-xmark det-xmark modal-xmark"></i>

                            <div class="det-status det-status-${status.toLowerCase().replace(" ", "-")}">${status}</div>
                            <div class="det-id">INV #${invoice.InvoiceNumber.split("-")[1] || 9402}</div>
                            <div class="det-date">Due ${convertDateFormat(invoice.DueDateString)}</div>
                            <div class="det-card">
                                <div>
                                    <div class="det-label">Ordered by</div>
                                    <div class="det-name">${invoice.Contact.Name}</div>
                                </div>
                                <i class="fa-solid fa-chevron-right det-chevron"></i>
                            </div>
                            <div class="det-list">
                                <div class="det-list-head">Invoice details</div>
                                <div class="det-li">
                                    <div class="det-li-label">Phone number</div>
                                    <div class="det-li-value">${phoneString || "Not given"}</div>
                                </div>
                                <div class="det-li">
                                    <div class="det-li-label">Invoice status</div>
                                    <div class="det-li-value">${status}</div>
                                </div>
                                <div class="det-li">
                                    <div class="det-li-label">Date Issued</div>
                                    <div class="det-li-value">${convertDateFormat(invoice.DateString)}</div>
                                </div>
                                <div class="det-li">
                                    <div class="det-li-label">Amount Paid</div>
                                    <div class="det-li-value">£${invoice.AmountPaid.toFixed(2)}</div>
                                </div>
                                <div class="det-li">
                                    <div class="det-li-label">Amount Due</div>
                                    <div class="det-li-value">£${invoice.AmountDue.toFixed(2)}</div>
                                </div>
                            </div>
                            <div class="det-btn button">View AI Chat</div>
                            <div class="det-cancel button">Exclude Recovery</div>
                        `;
                        if(dbInvoice.recovered == "yes"){
                            document.querySelector(".det-cancel").style.display = "none";
                        } else if(dbInvoice.cancelled == "yes"){
                            document.querySelector(".det-cancel").textContent = "Open Recovery";
                        } else {
                            document.querySelector(".det-cancel").style.display = "flex";
                        } 
                        document.querySelector(".det-modal").querySelector(".modal-xmark").addEventListener("click", () => {
                            document.querySelector(".det-modal").style.opacity = "0";
                            document.querySelector(".det-modal").style.pointerEvents = "none";
                        });

                        document.querySelector(".det-btn").addEventListener("click", () => {
                            document.querySelector(".det-modal").style.opacity = "0";
                            document.querySelector(".det-modal").style.pointerEvents = "none";
                            document.querySelector(".chat-modal").style.opacity = "1";
                            document.querySelector(".chat-modal").style.pointerEvents = "auto";

                            async function getChats(){
                                const dataToSend = { xeroId: invoice.InvoiceID };
                                try {
                                    const response = await fetch(url + `/api/get-chats`, {
                                        method: 'POST',
                                        credentials: 'include',
                                        headers: { 
                                            Authorization: `Bearer ${localStorage.getItem("token")}`,
                                            'Content-Type': 'application/json', 
                                        },
                                        body: JSON.stringify(dataToSend), 
                                    });

                                    if(!response.ok){
                                        const errorData = await response.json();
                                        console.error('Error:', errorData.message);
                                        return;
                                    }

                                    const data = await response.json();
                                    document.querySelector(".chat-ul").querySelectorAll(".chat-li").forEach(li => document.querySelector(".chat-ul").removeChild(li));
                                    data.messages.forEach(msg => {
                                        let chatLi = document.createElement("div");
                                        chatLi.classList.add("chat-li");
                                        let iconStr = "robot";
                                        if(msg.type == "response"){
                                            iconStr = "message";
                                        }
                                        chatLi.innerHTML = `
                                                <i class="fa-solid fa-${iconStr} chat-icon"></i>
                                                <div>
                                                    <div class="chat-label">${msg.heading}</div>
                                                    <div class="chat-txt">${msg.para}</div>
                                                </div>
                                                <div class="chat-date">${convertDateFormat(msg.date)}</div>
                                        `;
                                        document.querySelector(".chat-ul").appendChild(chatLi);
                                    });
                                    if(data.messages.length == 0){
                                        chatEmpty.style.display = "block";
                                    } else {
                                        chatEmpty.style.display = "none";
                                    }
                                } catch (error) {
                                    console.error('Error posting data:', error);
                                }
                            }
                            getChats();
                        });
                        document.querySelector(".det-card").addEventListener("click", () => document.querySelector(".det-btn").click());
                        document.querySelector(".det-cancel").addEventListener("click", () => {
                            async function toggleExclusion(){
                                let newValue = "yes";
                                if(dbInvoice.cancelled == "yes") newValue = "no";
                                const dataToSend = { id: dbInvoice.id, newValue: newValue };
                                try {
                                    const response = await fetch(url + `/api/toggle-exclusion`, {
                                        method: 'POST',
                                        credentials: 'include',
                                        headers: { 
                                            Authorization: `Bearer ${localStorage.getItem("token")}`,
                                            'Content-Type': 'application/json', 
                                        },
                                        body: JSON.stringify(dataToSend), 
                                    });

                                    if (!response.ok) {
                                        const errorData = await response.json();
                                        console.error('Error:', errorData.message);
                                        return;
                                    }

                                    const data = await response.json();
                                    if(data.message == "success"){
                                        window.location.href = "/?invoice=" + dbInvoice.id;
                                    }
                                } catch (error) {
                                    console.error('Error posting data:', error);
                                }
                            }
                            toggleExclusion();
                        });
                    });
                });
                if(params.get("invoice")){
                    document.getElementById("dbinv-" + params.get("invoice")).click();
                }
                document.querySelectorAll(".home-stat-num").forEach((num, idx) => {
                    if(idx == 0){
                        num.textContent = "£" + dashData.recovered.toFixed(2);
                    }
                    if(idx == 1){
                        num.textContent = "£" + dashData.waiting.toFixed(2);
                    }
                    if(idx == 2){
                        num.textContent = dashData.overdue;
                    }
                });
                if(dashData.recoveredList.length >= 6){
                    document.querySelector(".home-stat-bar").style.opacity = "1";
                    let highestPrice = 0;
                    for(let i = 0; i < 6; i++){
                        if(dashData.recoveredList[i] > highestPrice){
                            highestPrice = dashData.recoveredList[i];
                        }
                    }
                    for(let i = 0; i < 6; i++){
                        document.querySelectorAll(".home-stat-bar span").forEach((bar, idx) => {
                            if(i == idx){
                                let height = Number(64 * (dashData.recoveredList[i] / highestPrice));
                                if(height < 12) height = 12;
                                bar.style.height = height + "px";
                            }
                        });
                    }
                }

                document.querySelectorAll(".home-inv-option").forEach((option, idx) => {
                    option.addEventListener("click", () => {
                        document.querySelectorAll(".home-inv-option").forEach(other => {
                            other.classList.remove("home-inv-option-active");
                        });
                        option.classList.add("home-inv-option-active");

                        document.querySelectorAll(".home-inv-wrapper").forEach(wrapper => wrapper.style.display = "none");
                        if(idx == 0){
                            document.querySelectorAll(".home-inv-wrapper").forEach(wrapper => wrapper.style.display = "flex");
                        }
                        if(idx == 1){
                            document.querySelectorAll(".home-inv-wrapper").forEach(wrapper => {
                                if(wrapper.querySelector(".home-inv-status").classList.contains("home-inv-status-past-due")){
                                    wrapper.style.display = "flex";
                                }
                            });
                        }
                        if(idx == 2){
                            document.querySelectorAll(".home-inv-wrapper").forEach(wrapper => {
                                if(wrapper.querySelector(".home-inv-status").classList.contains("home-inv-status-recovered")){
                                    wrapper.style.display = "flex";
                                }
                            });
                        }
                        if(idx == 3){
                            document.querySelectorAll(".home-inv-wrapper").forEach(wrapper => {
                                if(wrapper.querySelector(".home-inv-status").classList.contains("home-inv-status-cancelled")){
                                    wrapper.style.display = "flex";
                                }
                            });
                        }
                    });
                });

                document.getElementById("refreshBtn").addEventListener("click", async () => {
                    await checkup();
                    //window.location.reload();
                });
            }

            document.querySelector(".con-btn").addEventListener("click", () => {
                async function connectXero(){
                    try {
                        const response = await fetch(`${url}/api/redirect-xero`, {
                            method: 'GET',
                            credentials: 'include',
                            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
                        });
                        const data = await response.json(); 
                        if(data.message == "success"){
                            window.location.href = data.url;
                        }
                    } catch (error) {
                        console.error('Error fetching data:', error);
                    }
                }
                connectXero();
            });
            if(userData?.notifications){
                document.querySelectorAll("i.home-noti").forEach(bell => {
                    bell.innerHTML = `
                        <div class="noti-red">3</div>
                        <div class="noti-drop">
                            <div class="noti-top">
                                <div class="noti-head">Notifications</div>
                                <div class="noti-mark">Mark as read</div>
                            </div>
                
                            <div class="noti-ul">
                                <!-- 
                                <div class="noti-li">
                                    <div class="noti-dot"></div>
                                    <div class="noti-col">
                                        <div class="noti-txt">Your password has been successfully changed.</div>
                                        <div class="noti-date">Dec 25, 2025 at 08:32am</div>
                                    </div>
                                    <i class="fa-solid fa-lock noti-icon"></i>
                                </div>
                                <div class="noti-li">
                                    <div class="noti-dot"></div>
                                    <div class="noti-col">
                                        <div class="noti-txt">You have been assigned to a new job.</div>
                                        <div class="noti-date">Dec 12, 2025 at 11:32am</div>
                                    </div>
                                    <i class="fa-solid fa-location-dot noti-icon"></i>
                                </div>
                                <div class="noti-li" style="border-bottom: 0; padding-bottom: 0;">
                                    <div class="noti-dot"></div>
                                    <div class="noti-col">
                                        <div class="noti-txt">Your monthly report has been updated.</div>
                                        <div class="noti-date">Dec 01, 2025 at 04:14pm</div>
                                    </div>
                                    <i class="fa-solid fa-chart-line noti-icon"></i>
                                </div>
                                -->
                                <div class="emp-wrapper" id="notiEmpty">
                                    <img src="images/nodata.svg" class="emp-icon" style="width: 200px;" />
                                    <div class="emp-head">No Notifications</div>
                                    <div class="emp-para">We couldn't find any notifications<br> for you. Try again later.</div>
                                </div>
                            </div>
                        </div>
                    `;
        
                    let newNotis = 0;
                    let anyNotis = 0;
                    userData.notifications.forEach((noti, idx) => {
                        let newNoti = document.createElement("div");
                        newNoti.classList.add("noti-li");
                        let readStr = "style='display: none;'";
                        if(noti.status == "unread"){
                            readStr = "";
                            newNotis++;
                        }
                        newNoti.innerHTML = `
                            <div class="noti-dot" ${readStr}></div>
                            <div class="noti-col">
                                <div class="noti-txt">${noti.title}</div>
                                <div class="noti-date">${noti.full_date}</div>
                            </div>
                            <i class="fa-solid fa-arrow-right noti-icon"></i>
                        `;
                        if(idx == userData.notifications.length - 1){
                            newNoti.style.paddingBottom = "0px";
                            newNoti.style.borderBottom = "0px";
                        }
                        bell.querySelector(".noti-ul").appendChild(newNoti);
                        anyNotis++;

                        newNoti.addEventListener("click", () => {
                            document.getElementById("dbinv-" + noti.invoice_id).click();
                        });
                    });
                    if(newNotis == 0){
                        bell.querySelector(".noti-red").style.display = "none";
                    } else {
                        bell.querySelector(".noti-red").style.display = "flex";
                        bell.querySelector(".noti-red").textContent = newNotis;
                    }
                    if(anyNotis == 0){
                        bell.querySelector("#notiEmpty").style.display = "block";
                    } else {
                        bell.querySelector("#notiEmpty").style.display = "none";
                    }
                    bell.querySelector(".noti-mark").addEventListener("click", () => {
                        bell.querySelectorAll(".noti-dot").forEach(dot => {
                            dot.style.display = "none";
                        });
                    });
        
                    bell.addEventListener("click", () => {
                        bell.querySelector(".noti-drop").style.opacity = "1";
                        bell.querySelector(".noti-drop").style.pointerEvents = "auto";
        
                        async function markRead() {
                            const dataToSend = { perms: userData.perms };
                            try {
                                const response = await fetch(url + '/api/mark-read', {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: { Authorization: `Bearer ${localStorage.getItem("token")}`,
                                        'Content-Type': 'application/json', 
                                    },
                                    body: JSON.stringify(dataToSend), 
                                });
        
                                if (!response.ok) {
                                    const errorData = await response.json();
                                    console.error('Error:', errorData.message);
                                    return;
                                }
        
                                const data = await response.json();
                            } catch (error) {
                                console.error('Error posting data:', error);
                            }
                        }
                        markRead();
                    });
        
                    document.addEventListener("click", (e) => {
                        if(!bell.querySelector(".noti-drop").contains(e.target) && !bell.contains(e.target)){
                            bell.querySelector(".noti-drop").style.opacity = "0";
                            bell.querySelector(".noti-drop").style.pointerEvents = "none";
                        }
                    });
                });
            }
        }

        if(document.querySelector(".auth")){
            async function createConnection(){
                const dataToSend = { code: params.get("code") };
                try {
                    const response = await fetch(url + `/api/create-connection`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 
                            Authorization: `Bearer ${localStorage.getItem("token")}`,
                            'Content-Type': 'application/json', 
                        },
                        body: JSON.stringify(dataToSend), 
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        console.error('Error:', errorData.message);
                        return;
                    }

                    const data = await response.json();
                    if(data.message == "success"){
                        window.location.href = "/";
                    }
                } catch (error) {
                    console.error('Error posting data:', error);
                }
            }
            createConnection();
        }

        if(document.querySelector(".login")){
            document.getElementById("logForm").addEventListener("submit", async (e) => {
                e.preventDefault(); 
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());

                const res = await fetch(url + "/api/login", {
                    method: "POST",
                    credentials: 'include',
                    headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" },
                    body: JSON.stringify(data)
                });

                const responseData = await res.json();
                if(responseData.message == "no user"){
                    document.getElementById("emailError").style.display = "block";
                    setTimeout(() => {
                        document.getElementById("emailError").style.display = "none";
                    }, 2000);
                } else if(responseData.message == "invalid password"){
                    document.getElementById("passwordError").style.display = "block";
                    setTimeout(() => {
                        document.getElementById("passwordError").style.display = "none";
                    }, 2000);
                } else if(responseData.message == "failure"){
                    document.getElementById("serverError").style.display = "block";
                    setTimeout(() => {
                        document.getElementById("serverError").style.display = "none";
                    }, 2000);
                } else if(responseData.message == "success") {
                    localStorage.setItem("token", responseData.token);
                    window.location.href = gitName + "/";
                } 
            });
        }

        if(document.querySelector(".signup")){
            document.getElementById("signForm").addEventListener("submit", async (e) => {
                e.preventDefault(); 
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());

                const res = await fetch(url + "/api/signup", {
                    method: "POST",
                    credentials: 'include',
                    headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" },
                    body: JSON.stringify(data)
                });

                const responseData = await res.json();
                if(responseData.message == "success"){
                    localStorage.setItem("token", responseData.token);
                    window.location.href = gitName + "/";
                } else if(responseData.message == "emailtaken"){
                    document.getElementById("emailError").style.display = "block";
                    setTimeout(() => {
                        document.getElementById("emailError").style.display = "none";
                    }, 2000);
                } else {
                    document.getElementById("serverError").style.display = "block";
                    setTimeout(() => {
                        document.getElementById("serverError").style.display = "none";
                    }, 2000);
                }
            });
        }

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}
getUser();