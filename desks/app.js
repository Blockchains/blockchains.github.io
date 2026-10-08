const ACT={code:["Ship","Block","Copy the comment","Pull requests"],threads:["Send","Later","Copy the email","Inbox"],tape:["Hold","Cut","Copy the note","Prices"],calendar:["Hold","Decline","Copy the note","Today"],ads:["Keep","Remove","Copy the ads","Ads"],metrics:["Use","Ignore","Copy the read","Numbers"],steps:["Done","Skip","Copy the steps","Steps"],brief:["Keep","Cut","Copy the page","Notes"]};
const KEY="bl-desk:";
const root=document.getElementById("app");
let ITEMS=[],query="";
function store(id){try{return JSON.parse(localStorage.getItem(KEY+id)||"{}")}catch(e){return {}}}
function save(id,patch){localStorage.setItem(KEY+id,JSON.stringify(Object.assign({},store(id),patch)))}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return "&#"+c.charCodeAt(0)+";"})}
function route(){const id=(location.hash||"").replace(/^#\/?/,"");if(!id)return home();const item=ITEMS.find(function(x){return x.id===id});if(!item)return home();openItem(item)}
function home(){const q=query.trim().toLowerCase();const list=ITEMS.filter(function(x){return !q||(x.product+" "+x.name+" "+x.line).toLowerCase().indexOf(q)>=0});root.innerHTML='<header><div><h1>Apps</h1><p>'+list.length+' you can use right now</p></div></header><main><input class="find" placeholder="Find an app" aria-label="Find an app" value="'+esc(query)+'">'+list.map(function(x){return '<button class="app" data-id="'+x.id+'"><b>'+esc(x.product)+'</b><span>'+esc(x.line)+'</span></button>'}).join("")+'</main>';
root.querySelector(".find").addEventListener("input",function(e){query=e.target.value;home();root.querySelector(".find").focus()});
root.querySelectorAll(".app").forEach(function(b){b.addEventListener("click",function(){location.hash=b.dataset.id})})}
async function rowsFor(item){
if(item.pulls&&item.repo){const data=await (await fetch("https://api.github.com/repos/"+item.repo+"/pulls?state=open&per_page=8&sort=updated")).json();if(Array.isArray(data)&&data.length)return data.map(function(p){return {title:p.title,meta:(p.user&&p.user.login)||item.name,href:p.html_url,body:(p.body||"No description on this pull request.").slice(0,900)}})}
if(item.repo){const data=await (await fetch("https://api.github.com/repos/"+item.repo+"/issues?state=open&per_page=12")).json();if(Array.isArray(data)){const issues=data.filter(function(p){return !p.pull_request}).slice(0,8).map(function(p){return {title:p.title,meta:(p.user&&p.user.login)||item.name,href:p.html_url,body:(p.body||"No description.").slice(0,900)}});if(issues.length)return issues}}
if(item.tape){const ids=["btc-bitcoin","eth-ethereum","sol-solana"];const got=await Promise.all(ids.map(function(id){return fetch("https://api.coinpaprika.com/v1/tickers/"+id).then(function(r){return r.json()})}));return got.filter(function(t){return t&&t.quotes}).map(function(t){const usd=t.quotes.USD||{};const px=usd.price?"$"+Number(usd.price).toLocaleString("en-US",{maximumFractionDigits:usd.price>100?0:2}):"";const ch=usd.percent_change_24h!=null?(usd.percent_change_24h>=0?"+":"")+usd.percent_change_24h.toFixed(1)+"% today":"";return {title:t.symbol+"  "+px,meta:ch,href:"https://coinpaprika.com/coin/"+t.id,body:px+" "+ch+". A move is not a reason to trade. Write why you still hold if this drops 12%."}})}
if(item.npm){const data=await (await fetch("https://api.npmjs.org/downloads/point/last-week/"+encodeURIComponent(item.npm))).json();if(data&&data.downloads){const n=Number(data.downloads).toLocaleString("en-US");return [{title:n+" downloads this week",meta:item.npm,href:"https://www.npmjs.com/package/"+item.npm,body:item.npm+" was downloaded "+n+" times in the last 7 days. Use the number only if it changes what you ship."}]}}
const data=await (await fetch("https://hn.algolia.com/api/v1/search?query="+encodeURIComponent(item.hn||item.name)+"&tags=story&hitsPerPage=8")).json();
const hits=(data&&data.hits)||[];
return hits.map(function(h){return {title:h.title||"Untitled",meta:(h.points||0)+" points",href:h.url||("https://news.ycombinator.com/item?id="+h.objectID),body:String(h.story_text||h.title||"").replace(/<[^>]+>/g,"").slice(0,700)}})
}
async function openItem(item){
const act=ACT[item.layout]||ACT.brief;const saved=store(item.id);
root.innerHTML='<header><button class="back" aria-label="All apps">\u2190</button><div style="min-width:0"><h1>'+esc(item.product)+'</h1><p>'+esc(item.line)+'</p></div></header><main><p class="err">Opening\u2026</p></main>';
root.querySelector(".back").onclick=function(){location.hash=""};
let rows=[];try{rows=await rowsFor(item)}catch(e){rows=[]}
if((location.hash||"").replace(/^#\/?/,"")!==item.id)return;
if(!rows.length){root.querySelector("main").innerHTML='<p class="err">Nothing live right now. Try again in a minute.</p>';return}
let index=Math.min(saved.index||0,rows.length-1);const marks=saved.marks||{};
function paint(){
const row=rows[index];const key=row.title.slice(0,80);const draft=row.body;const mark=marks[key];
root.querySelector("main").innerHTML='<p class="meta">'+esc(row.meta||item.name)+'</p><h2>'+esc(row.title)+'</h2>'+(mark?'<p class="mark">'+esc(mark==="keep"?act[0]:act[1])+'</p>':"")+'<p class="body">'+esc(draft)+'</p><div class="queue"><p class="meta" style="margin-bottom:6px">'+esc(act[3])+'</p>'+rows.map(function(r,i){return '<button data-i="'+i+'" class="'+(i===index?"on":"")+'"><b>'+esc(r.title)+'</b><span>'+esc(r.meta||"")+'</span></button>'}).join("")+'</div>';
root.querySelectorAll(".queue button").forEach(function(b){b.onclick=function(){index=Number(b.dataset.i);save(item.id,{index:index});paint()}});
let bar=root.querySelector(".bar");if(!bar){bar=document.createElement("div");bar.className="bar";root.appendChild(bar)}
bar.innerHTML='<div class="row"><button class="go">'+esc(act[0])+'</button><button class="no">'+esc(act[1])+'</button></div><button class="copy">'+esc(act[2])+'</button>';
bar.querySelector(".go").onclick=function(){decide("keep")};
bar.querySelector(".no").onclick=function(){decide("drop")};
bar.querySelector(".copy").onclick=async function(){const text=((mark==="keep"?act[0]:mark==="drop"?act[1]:"")+"\n\n"+draft+"\n\n"+(row.href||"")).trim();try{await navigator.clipboard.writeText(text);bar.querySelector(".copy").textContent="Copied"}catch(e){bar.querySelector(".copy").textContent="Select and copy"}};
function decide(next){marks[key]=next;save(item.id,{marks:marks,index:index});paint()}
}
paint()
}
addEventListener("hashchange",route);
fetch("apps.json").then(function(r){return r.json()}).then(function(data){ITEMS=data;route()}).catch(function(){root.innerHTML='<header><div><h1>Apps</h1><p class="err">Could not open the list.</p></div></header>'});
