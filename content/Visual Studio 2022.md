---
categories:
  - "[[Softwares]]"
maker: "[[Microsoft]]"
url: https://visualstudio.microsoft.com/vs/
rating:
public: true
---
### Intellisense underlining everything although the project compile just fine
Delete the `.vs` directory at the solution's root directory.

### Intellisense not working for Razor pages when the solution buildo
Delete the `.vs` directory at the solution's root directory.

### Impossibility to upgrade packages when upgrading .NET version using Nuget Package Manager
It's probably because of dependencies between packages. Therefore, setting up the package version in the `csproj` and then restoring the packages can fix the issue.

### Launch the project into an integrated terminal instead of external
*Tools > Options > Projects and Solutions > ASP.NET Core > Run web server in* = Integrated Terminal

### Regroup appsettings.json environment files underneath appsettings.json in the file manager :
Edit project file and add a DependentUpon property to the environment json.
```json
<ItemGroup>
<None Update="appsettings.Development.json">
<CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
<DependentUpon>appsettings.json</DependentUpon>
</None>
<None Update="appsettings.json">
<CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
</None>
</ItemGroup>
```

### Avoid autocomplete in Razor files when pressing space :
- Go to *Settings > Options > Text Editor > Razor (ASP.NET Core) > Advanced*.
- Set the value of `Commit elements with space` to False.
- Note : this seems not to work most of the time, looking for a better solution.
- 
### Surround a tag with another tag
Use the shortcut `Alt + Shift + w`

### Using directives
- *Tools > Options > C# > Advanced > Using Directives*
- Uncheck Place `System directive first when sorting usings`

### Blazor: avoid the browser window being closed when debugging is stopped / recompiling
- *Tools > Options > Projects and Solutions > Web projects*.
- Uncheck `Stop debugger when browser window is closed, close browser when debugging stops`.

### Display the tests code coverage
- Install the extension [Fine Code Coverage](https://marketplace.visualstudio.com/items?itemName=FortuneNgwenya.FineCodeCoverage2022).
- In the context menu, click on *View > Other Windows > Fine Code Coverage*
- Run the tests and wait for the results to be displayed
