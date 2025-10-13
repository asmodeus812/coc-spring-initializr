// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

"use strict";
import * as coc from "coc.nvim";
import * as fs from "fs";
import * as path from "path";
import { AddStartersHandler, GenerateProjectHandler } from "./handler";
import { ProjectType } from "./model";
import { getTargetPomXml, loadPackageInfo } from "./Utils";
import { BaseHandler } from "./handler/BaseHandler";

export async function activate(context: coc.ExtensionContext): Promise<void> {
    // await initializeFromJsonFile(context.asAbsolutePath("./package.json"));
    initializeExtension(context);
}

export async function initializeExtension(context: coc.ExtensionContext): Promise<void> {
    await loadPackageInfo(context);

    context.subscriptions.push(
        coc.commands.registerCommand(
            "spring.initializr.maven-project",
            async (operationId, defaults) => await new GenerateProjectHandler(ProjectType.MAVEN, defaults).run(operationId),
            true
        ),
        coc.commands.registerCommand(
            "spring.initializr.gradle-project",
            async (operationId, defaults) => await new GenerateProjectHandler(ProjectType.GRADLE, defaults).run(operationId),
            true
        ),
        coc.commands.registerCommand(
            "spring.initializr.gradle-project-kotlin",
            async (operationId, defaults) => await new GenerateProjectHandler(ProjectType.GRADLE_KOTLIN, defaults).run(operationId),
            true
        )
    );

    context.subscriptions.push(
        coc.commands.registerCommand("spring.initializr.createProject", async () => {
            const projectType: any = await coc.window.showQuickPick(
                [
                    { value: "maven-project", label: "Maven Project" },
                    { value: "gradle-project", label: "Gradle Project" },
                    {
                        value: "gradle-project-kotlin",
                        label: "Gradle Project - Kotlin DSL"
                    }
                ],
                { placeHolder: "Select project type." }
            );
            if (projectType) {
                await coc.commands.executeCommand(`spring.initializr.${projectType.value}`);
            }
        })
    );

    context.subscriptions.push(
        coc.commands.registerCommand(
            "spring.initializr.addStarters",
            async () => {
                const targetFile: coc.Uri | undefined = await getTargetPomXml();
                if (targetFile) {
                    const handler: BaseHandler = new AddStartersHandler();
                    await handler.run("", targetFile);
                } else {
                    coc.window.showInformationMessage("No pom.xml found in the workspace.");
                }
            },
            true
        )
    );

    if (coc.workspace.workspaceFolders?.length === 1) {
        const flagFile = path.join(coc.workspace.workspaceFolders[0].uri, ".vim/NEWLY_CREATED_BY_SPRING_INITIALIZR");
        try {
            await fs.promises.access(flagFile);
            const readmeFileUris = await coc.workspace.findFiles(
                new coc.RelativePattern(coc.workspace.workspaceFolders[0], "{readme,README,help,HELP}.md")
            );
            if (readmeFileUris.length > 0) {
                await coc.commands.executeCommand("markdown.showPreview", readmeFileUris[0]);
            }
            await fs.promises.unlink(flagFile);
        } catch (error: any) {
            coc.window.showWarningMessage(error?.message);
        }
    }
}
