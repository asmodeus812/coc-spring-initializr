# coc-spring-initializr

Create Spring Boot projects from Neovim with a Spring Initializr service, and
add Spring Boot starters to an existing Maven project. This is the coc.nvim
port of the VS Code extension Spring Initializr Java Support.

- Generate a Maven, Gradle or Gradle Kotlin DSL project: Spring Boot version,
  language, group id, artifact id, package name, packaging, Java version and
  dependencies.
- Search the dependencies, and reuse the ones of the last generated project.
- Add starters to the `pom.xml` of a Maven Spring Boot project.
- `<Esc>`, `<C-c>` or an empty answer at any wizard step (pickers and text
  inputs) cancels the wizard quietly.

How to use it inside Neovim, every command and every message you can see:
`:help coc-spring-initializr`.

## Requirements

- Neovim or Vim with [coc.nvim](https://github.com/neoclide/coc.nvim) 0.0.82
  or newer.
- Network access to the Spring Initializr service, https://start.spring.io by
  default.
- A JDK, and Maven or Gradle, to build the generated project. The extension
  itself does not need them.

## Installation

```vim
:CocInstall coc-spring-initializr
```

From source:

```sh
git clone <repository> coc-spring-initializr
cd coc-spring-initializr
npm ci
npm run build
```

Then add the folder to the runtimepath, for example
`set runtimepath^=~/src/coc-spring-initializr` in your vimrc, and restart.

## Settings

Put the settings in `:CocConfig`. All of them are optional.

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `spring.initializr.serviceUrl` | string or array | `["https://start.spring.io"]` | One service URL or a list. With several, the wizard asks which one to use. See below. |
| `spring.initializr.defaultLanguage` | string | `""` | Values: `""`, `"Java"`, `"Kotlin"`, `"Groovy"`. Empty asks in the wizard; a value skips the step. |
| `spring.initializr.defaultJavaVersion` | string | `""` | Values: `""`, `"27"`, `"25"`, `"21"`, `"17"`. Empty asks in the wizard; a value skips the step. |
| `spring.initializr.defaultGroupId` | string | `"com.example"` | Prefilled in the Group Id step. |
| `spring.initializr.defaultArtifactId` | string | `"demo"` | Prefilled in the Artifact Id step. |
| `spring.initializr.defaultPackaging` | string | `""` | Values: `""`, `"JAR"`, `"WAR"`. Empty asks in the wizard; a value skips the step. |
| `spring.initializr.defaultOpenProjectMethod` | string | `""` | What happens after a project is generated. Values: `""`, `"Open"`, `"Cancel"`. `Open` opens the generated project, `Cancel` leaves it closed, empty asks. |
| `spring.initializr.parentFolder` | string | `"artifactId"` | Where the project goes in the workspace folder. `artifactId`: a new folder named after the artifact id; `none`: the workspace folder itself. |
| `spring.initializr.revealAddedStarters` | string | `"always"` | Where the cursor goes after add starters edits the pom. `always`: the pom is shown with the cursor on the first added dependency. `current`: the cursor moves only when the pom is the current buffer. `never`: nothing moves. |

Example:

```jsonc
{
  "spring.initializr.defaultLanguage": "Java",
  "spring.initializr.defaultJavaVersion": "21",
  "spring.initializr.defaultGroupId": "org.acme",
  "spring.initializr.defaultPackaging": "JAR",
  "spring.initializr.defaultOpenProjectMethod": "Open"
}
```

### A custom service URL

`spring.initializr.serviceUrl` takes one URL or a list. With several URLs the
wizard asks which one to use each time.

```jsonc
"spring.initializr.serviceUrl": [
  "https://start.spring.io",
  "https://initializr.example.com"
]
```

The URL must start with `http://` or `https://`. Redirects are followed, up to
five.

## Troubleshooting

- "Failed to fetch metadata.": the service is not reachable. Check the network,
  a proxy, and `spring.initializr.serviceUrl`.
- "Failed to create a project." followed by the service's message: the service
  rejected the chosen values. Pick another Spring Boot or Java version.
- `:help coc-spring-initializr` is missing: look for "Unable to register the
  help page" in the messages; the data folder of coc must be writable.

Every message is explained in `:help coc-spring-initializr-messages`.

## Development

```sh
npm ci
npm run build       # bundle into lib/
npm run watch       # rebuild on change
npm run typecheck   # type check without emitting
```

## License

This extension is licensed under the [MIT License](./LICENSE.txt).

## Contributing

This project has adopted the
[Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the
[Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any
additional questions or comments.
