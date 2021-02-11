import json, requests, os, sys

url = 'https://airnowgovapi.com/andata/ReportingAreas/Salt_Lake_City_UT_MONTH.json'
try:
    response = requests.Session().get(url, timeout=3600)
    if(response.status_code!=200):
        print('Error response, code = %d, body = %s' % (response.status_code, response.text))
except requests.exceptions.RequestException as e:
    sys.stdout.write("Couldn't read %s because %s" % (url, e))

data = json.loads(json.loads(response.content))
dates = data["utcDateTimes"]
vals = data["aqi"]
latest = dict(zip(dates,vals))

with open("assets/data/aqi_dict.json") as f2:
    old = json.loads(f2.read())
    old.update(latest)
    json.dump(old,open("assets/data/aqi_dict.json",'w'))