---
created: 2026-05-05
tags:
  - 0🌲
  - tech
public: true
---
## Plugins

### Error lens
[Link to the store](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens)
Displays the warning/errors at the end of the line so we don't have to hover to read them.

### Azure Event Hub Explorer
[Link to the store](https://marketplace.visualstudio.com/items?itemName=Summer.azure-event-hub-explorer)
Connect to an [[Azure EventHub]] to see the events being sent.
Install the app and then go into the settings to set the connection information. Then, `Ctrl+Shift+P` and look for `EventHub: Start monitoring Event Hub message`

## [[dotnet]] Choose a debug profile to start when clicking on run/debug

- Declare the profiles in the file `launchSettings.json`.
- Press `Ctrl+Shift+p` and type `.NET: Select launch configuration`.
- Pick your profile in the list.

## [[dotnet]] View code coverage

- Open the **Testing** view in the left side bar.
- Right click on the root element of the tests, then `Run Test with Coverage`.
- The **TEST COVERAGE** section of the **Testing** view will show the code coverage of each file.

## Convert a multi-lines JSON into a one liner

- Select all the lines of the JSON object
- *Ctrl+Shift+p* > `Join lines`