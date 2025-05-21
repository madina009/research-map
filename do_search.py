# Install the Python Requests library:
# `pip install requests`

import requests
import json


def send_request():
    # Search
    # POST https://api.notion.com/v1/search

    try:
        response = requests.post(
            url="https://api.notion.com/v1/search",
            headers={
                "Notion-Version": "2022-06-28",
                "Authorization": "Bearer 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",
                "Content-Type": "application/json; charset=utf-8",
                "Cookie": "_cfuvid=_z89hsZP8nOqgilIqFpfmncspCRo7XI3Axec39qtlF4-1747815745090-0.0.1.1-604800000; __cf_bm=ZwTzskCPyW4ZAlLMfwWZRFJ7ygP_cmwAtJAsl9oxcds-1747818220-1.0.1.1-hDk6uUhFW2qgo.i95AQ5sfLN1AI1TFj9wi4H0EWmwFx_VD5O0xuThkHqE0rHH1K1IX0g0jlTcLSX_acBqMEXQFOvDHCD.ZuKsXPxx9texgI",
            },
            data=json.dumps({
                "query": "Madina"
            })
        )
        print('Response HTTP Status Code: {status_code}'.format(
            status_code=response.status_code))
        print('Response HTTP Response Body: {content}'.format(
            content=response.content))
    except requests.exceptions.RequestException:
        print('HTTP Request failed')
send_request()
