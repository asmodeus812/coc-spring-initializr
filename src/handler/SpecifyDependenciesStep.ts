// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { QuickPickItem, window } from "coc.nvim";
import { DependencyManager, IDependenciesItem } from "../DependencyManager";
import { IProjectMetadata, IStep } from "./HandlerInterfaces";

export class SpecifyDependenciesStep implements IStep {
    public static getInstance(): SpecifyDependenciesStep {
        return SpecifyDependenciesStep.specifyDependenciesStep;
    }

    private static readonly specifyDependenciesStep: SpecifyDependenciesStep = new SpecifyDependenciesStep();

    public getNextStep(): IStep | undefined {
        return undefined;
    }

    public async execute(_: string, projectMetadata: IProjectMetadata): Promise<IStep | undefined> {
        if (!(await this.specifyDependencies(projectMetadata))) {
            return projectMetadata.pickSteps.pop();
        }
        return this.getNextStep();
    }

    private async specifyDependencies(projectMetadata: IProjectMetadata): Promise<boolean> {
        const dependencyManager = new DependencyManager(projectMetadata.bootVersion as string);
        let current: IDependenciesItem | undefined | null = null;
        let result: boolean = false;
        dependencyManager.selectedIds = projectMetadata.defaults.dependencies || [];
        do {
            const quickPickItems: Array<QuickPickItem & IDependenciesItem> = await dependencyManager.getQuickPickItems(
                projectMetadata.serviceUrl as string,
                { hasLastSelected: true }
            );
            current = await window.showQuickPick(quickPickItems, {
                matchOnDescription: true,
                title: "Spring Initializr: Specify dependencies",
                placeholder: "Search for dependencies."
            });
            if (current?.itemType === "dependency") {
                dependencyManager.toggleDependency(current.id);
            }
        } while (current?.itemType === "dependency");

        if (current !== undefined) {
            projectMetadata.dependencies = current;
            dependencyManager.updateLastUsedDependencies(current);
            result = true;
        }
        return result;
    }
}
