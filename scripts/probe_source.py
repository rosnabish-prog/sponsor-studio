#!/usr/bin/env python3
"""One-off diagnostic: inspect published BuildUp match page structure."""
import re, urllib.request, json
from html.parser import HTMLParser
url="https://stats.buildup.club/matches"
request=urllib.request.Request(url,headers={"User-Agent":"SponsorStudioFixtureSync/0.1 (public-data-readonly)","Accept":"text/html"})
with urllib.request.urlopen(request,timeout=25) as response:
    html=response.read().decode("utf-8","replace")
    print("HTTP",response.status,"content-type",response.headers.get("Content-Type"),"bytes",len(html))
print("Next flight markers",html.count("self.__next_f.push"),"Next data",html.count("__NEXT_DATA__"))
for key in ("M13","M21","River Plate","Boca Juniors","2026-10-29","matchId","fixtures","kickoff","date","group","selectedDay"):
    print("KEY",key,"COUNT",html.lower().count(key.lower()))
for match in list(re.finditer(r"M(?:[1-4]?[0-9])",html))[:8]:
    s=html[max(0,match.start()-160):match.end()+220]
    print("SNIP",re.sub(r"\\u([0-9a-fA-F]{4})",lambda m:chr(int(m.group(1),16)),s)[:380])
class P(HTMLParser):
    def __init__(self):
        super().__init__();self.in_script=False;self.scripts=[];self.links=[];self.buttons=[];self.in_button=False;self.btxt=""
    def handle_starttag(self,t,a):
        d=dict(a)
        if t=="script":self.in_script=True;self.scripts.append({"src":d.get("src",""),"content":""})
        if t=="a":self.links.append(d.get("href",""))
        if t=="button":self.in_button=True;self.btxt=""
    def handle_data(self,d):
        if self.in_script and self.scripts:self.scripts[-1]["content"]+=d
        if self.in_button:self.btxt+=d
    def handle_endtag(self,t):
        if t=="script":self.in_script=False
        if t=="button":self.in_button=False;self.buttons.append(self.btxt.strip())
p=P();p.feed(html)
print("SCRIPT_SRCS",json.dumps([s["src"] for s in p.scripts if s["src"]][:25]))
print("NAV_LINKS",json.dumps(p.links[:60]))
print("BUTTONS",json.dumps(p.buttons[:35]))
for s in p.scripts:
    if s["content"] and any(x in s["content"] for x in ("Boca","M13","match")):
        print("DATA_SCRIPT",len(s["content"]),s["content"][:350])

from urllib.parse import urljoin
for obj in [x for x in p.scripts if x["src"]][:3]:
    path=obj["src"]
    with urllib.request.urlopen(urllib.request.Request(urljoin(url,path),headers={"User-Agent":"Mozilla/5.0"}),timeout=40) as response:
        js=response.read().decode("utf-8","replace")
    print("BUNDLE",path,"SIZE",len(js))
    for key in ('/api/','https://','/matches','getMatches','fixtures','kickoff','fetch(','axios','matchId','matchNumber','match_number','/v1/'):
        mm=list(re.finditer(re.escape(key),js,re.I))
        print("JSKEY",key,"COUNT",len(mm))
        for match in mm[:5]:
            print("JS_SNIP",key,js[max(0,match.start()-160):match.end()+260][:420].replace(chr(10),' '))
    allurls=re.findall(r'https?://[^\\s"\x27<>\\\\]+',js)
    print("JS_URLS",json.dumps(sorted(set(allurls))[:50])[:4000])

    for key in ('entities.Match','entities.Matches','entities.match','.Match.list','.Match.filter','appBaseUrl','apiBaseUrl','appId','/entities/','base44','api.base44.com','match_number','match_date','start_time','home_team'):
        mm=list(re.finditer(re.escape(key),js,re.I))
        print("DATAKEY",key,"COUNT",len(mm))
        for match in mm[-7:]:
            print("DATA_SNIP",key,js[max(0,match.start()-220):match.end()+320][:550].replace(chr(10),' '))
