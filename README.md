# Spring Initializr Java Support for Coc.nvim

This is a fork of the vs code extension for spring boot initializer that is
adapted to work with the coc.nvim ecosystem.

## Overview

Spring Initializr is a lightweight extension to quickly generate a Spring Boot
project in Visual Studio Code (VS Code). It helps you to customize your projects
with configurations and manage Spring Boot dependencies.

## Feature List

- Generate a Maven/Gradle Spring Boot project
- Customize configurations for a new project (language, Java version, group id,
  artifact id, boot version and dependencies)
- Search for dependencies
- Quickstart with last settings
- Edit Spring Boot dependencies of an existing Maven Spring Boot project

## Configuration

```
  // Default language.
  "spring.initializr.defaultLanguage": "Java",

  // Default Java version.
  "spring.initializr.defaultJavaVersion": "11",

  // Default value for Artifact Id.
  "spring.initializr.defaultArtifactId": "demo",

  // Default value for Group Id.
  "spring.initializr.defaultGroupId": "com.example",

  // Spring Initializr Service URL(s). If more than one url is specified, it requires you to select one every time you create a project.
  "spring.initializr.serviceUrl": [ "https://start.spring.io" ],

  // Default value for Packaging. Supported values are "JAR" and "WAR".
  "spring.initializr.defaultPackaging": "JAR",

  // Default value for the method of openining the newly generated project. Supported values are "", "Open" and "Add to Workspace".
  "spring.initializr.defaultOpenProjectMethod": "Add to Workspace",
```

## License

This extension is licensed under [MIT License](./LICENSE.txt).

## Contributing

This project has adopted the
[Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the
[Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any
additional questions or comments.
