// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import * as path from "path";
import { DependencyManager, IDependenciesItem } from "../DependencyManager";
import { getBootVersion, getDependencyNodes, getParentRelativePath, IMavenId, IStarters, serviceManager, XmlNode } from "../model";
import { readXmlContent } from "../Utils";
import { isDirectory, isFile, pathExists } from "../Utils/fsHelper";
import { updatePom } from "../Utils/xml";
import { BaseHandler } from "./BaseHandler";
import { specifyServiceUrl } from "./utils";

export class AddStartersHandler extends BaseHandler {
    private serviceUrl: string | undefined = undefined;

    protected get failureMessage(): string {
        return "Fail to edit starters.";
    }

    public async runSteps(_: string, entry: coc.Uri): Promise<void> {
        const bootVersion: string | undefined = await searchForBootVersion(entry);
        if (!bootVersion) {
            const ex = new Error("Not within a valid Spring Boot project.");
            throw ex;
        }

        const deps: string[] = []; // gid:aid
        // Read pom.xml for $dependencies(gid, aid)
        const baseDocument: coc.Document = await coc.workspace.openTextDocument(entry);
        const content: string | undefined = baseDocument.textDocument.getText();
        const xml: { project: XmlNode } = await readXmlContent(content);

        getDependencyNodes(xml.project).forEach((elem) => {
            deps.push(`${elem.groupId[0]}:${elem.artifactId[0]}`);
        });

        this.serviceUrl = await specifyServiceUrl();
        if (this.serviceUrl === undefined) {
            return;
        }
        const starters: IStarters = await coc.window.withProgress<IStarters>({ title: "Dependencies list" }, async (progress) => {
            progress.report({ message: `Fetching metadata for ${bootVersion} ...` });
            return await serviceManager.getStarters(this.serviceUrl as string, bootVersion);
        });

        const oldStarterIds: string[] = [];
        if (!starters.dependencies) {
            await coc.window.showErrorMessage("Unable to retrieve information of available starters.");
            return;
        }

        Object.keys(starters.dependencies).forEach((key) => {
            const elem: IMavenId = starters.dependencies[key];
            if (deps.indexOf(`${elem.groupId}:${elem.artifactId}`) >= 0) {
                oldStarterIds.push(key);
            }
        });
        const dependencyManager = new DependencyManager(bootVersion);
        const results: string[] = [];
        results.push(...oldStarterIds);
        dependencyManager.selectedIds = results;
        let current: IDependenciesItem | undefined | null = null;
        do {
            current = await coc.window.showQuickPick(dependencyManager.getQuickPickItems(this.serviceUrl), {
                matchOnDescription: true,
                placeholder: "Select dependencies to add."
            });
            if (current?.itemType === "dependency" && oldStarterIds.indexOf(current.id) === -1) {
                dependencyManager.toggleDependency(current.id);
            }
        } while (current && current.itemType === "dependency");

        if (!current || current === undefined) {
            return;
        }

        const toAdd: string[] = dependencyManager.selectedIds.filter((elem) => oldStarterIds.indexOf(elem) < 0);
        if (toAdd.length === 0) {
            coc.window.showInformationMessage("No changes.");
            return;
        }

        const msgAdd: string = toAdd?.length
            ? `Adding: [${toAdd
                  .map((d) => dependencyManager?.dict[d].name)
                  .filter(Boolean)
                  .join(", ")}].`
            : "";
        const choice: string | undefined = await coc.window.showQuickPick(["Proceed", "Cancel"], {
            placeHolder: `${msgAdd} Proceed?`
        });
        if (choice !== "Proceed") {
            return;
        }

        const artifacts = toAdd.map((id) => starters.dependencies[id]);
        const bomIds = toAdd.map((id) => starters.dependencies[id].bom).filter(Boolean);
        const boms = bomIds.filter((id) => id !== undefined).map((id) => starters.boms[id]);

        updatePom(entry, artifacts, boms);
        coc.window.showInformationMessage("Pom file successfully updated.");
    }
}

async function searchForBootVersion(uri: coc.Uri): Promise<string | undefined> {
    const content: string = await coc.workspace.readFile(uri.fsPath);
    const { project: projectNode } = await readXmlContent(content);
    const bootVersion: string | undefined = getBootVersion(projectNode);

    if (bootVersion) {
        return bootVersion;
    }

    // search recursively in parent pom
    const relativePath = getParentRelativePath(projectNode);
    if (relativePath) {
        // <relativePath> not empty, search filesystem first.
        // See https://maven.apache.org/ref/3.8.5/maven-model/maven.html#parent
        const newPath = path.join(path.dirname(uri.path), relativePath);
        let newUri = uri.with({ path: newPath });

        if (await isDirectory(newUri)) {
            newUri = uri.with({ path: path.join(newPath, "pom.xml") });
        }
        if ((await pathExists(newUri)) && (await isFile(newUri))) {
            return await searchForBootVersion(newUri);
        }
    }
    return undefined;
}
