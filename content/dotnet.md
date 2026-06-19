---
created: 2026-05-04
tags:
  - 0🌲
  - tech
public: "true"
---
## Snippets
### Read a section from `appsettings.json`
```C#
IConfiguration configuration = new ConfigurationBuilder()
	.AddJsonFile("./config/appsettings.json", optional: false, reloadOnChange: false)
	.AddJsonFile("./config/appsettings.Development.json", optional: true, reloadOnChange: false)
	.Build();
// Read the section "Settings" and insert its values into a SettingsOptions
_settings = configuration.GetSection("Settings").Get<SettingsOptions>();
```

## Check if a value is not null, bind it to a new variable and use it to declare another type without condition

```csharp
var completedSubtreeIds = existingCheckpoint?.CompletedSubtreeIds is { } ids
    ? new HashSet<string>(ids) : [];
```

It's a null-safe way to either wrap the checkpoint's list in a `HashSet`, or return an empty set if there's nothing to load. Breaking it down:

- `existingCheckpoint?.CompletedSubtreeIds` — safely accesses the property; if `existingCheckpoint` is null, the whole expression short-circuits to null.
- `is { } ids` — a pattern match that succeeds only if the value is **not null**, and binds it to the local variable `ids`.
- `ids` is `List<string>` — the same type as `CompletedSubtreeIds`. The `is { }` pattern is a non-null check (it matches any non-null object), and `ids` is simply an alias bound to the value that passed the check. No type conversion happens; the compiler infers the type from the property being tested.
- `? new HashSet<string>(ids)` — if it matched (list exists), wrap it in a `HashSet` for O(1) lookup when checking which subtrees to skip.
- `: []` — otherwise, start with an empty set (no prior progress).

It's equivalent to this longer form:

```csharp
HashSet<string> completedSubtreeIds;
if (existingCheckpoint?.CompletedSubtreeIds is not null)
    completedSubtreeIds = new HashSet<string>(existingCheckpoint.CompletedSubtreeIds);
else
    completedSubtreeIds = [];
```

The reason it's a `HashSet` rather than a `List` is the `.Contains()` call on line 117 — checking membership in a list is O(n), in a `HashSet` it's O(1), which matters when you have hundreds of subtrees to filter.

## Commands

### Solution
#### Add a project to the solution
```shell
dotnet sln add .\ProjectToAdd\ProjectToAdd.csproj
```
#### Remove a project from a solution
```shell
dotnet sln remove .\ProjectToAdd\ProjectToAdd.csproj
```
### Project
#### Add a reference to a project
```shell
dotnet reference add .\ProjectToReference\ProjectToReference.csproj --project .\ProjectToAddTheReferenceTo\ProjectToAddTheReferenceTo.csproj
```
#### Generate a global.json file
```shell
dotnet new globaljson --sdk-version 8.0.302 --roll-forward latestFeature
```
### Nuget
#### Add a nuget package to a project
```shell
dotnet add package packageName
```
#### Restore packages interactively (to manage eventual authentication)
```shell
dotnet restore --interactive
```
