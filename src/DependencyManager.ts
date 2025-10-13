// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { QuickPickItem } from "coc.nvim";
import { IDependency, serviceManager } from "./model";
import { readFileFromExtensionRoot, writeFileToExtensionRoot } from "./Utils";

const DEPENDENCIES_HISTORY_FILENAME: string = ".last_used_dependencies";

export class DependencyManager {
    public lastselected: string | null = null;
    public dependencies: IDependency[] = [];
    public dict: { [key: string]: IDependency } = {};
    public selectedIds: string[] = [];

    constructor(public bootVersion: string) {}

    public updateLastUsedDependencies(v: IDependenciesItem): void {
        writeFileToExtensionRoot(DEPENDENCIES_HISTORY_FILENAME, v.id);
        this.lastselected = v.id;
    }

    public async initialize(dependencies: IDependency[]): Promise<void> {
        this.dependencies = dependencies.filter((dep) => dep !== undefined);
        for (const dep of this.dependencies) {
            if (dep.id) {
                this.dict[dep.id] = dep;
            }
        }
        const idList: string | null = await readFileFromExtensionRoot(DEPENDENCIES_HISTORY_FILENAME);
        this.lastselected = idList;
    }

    public async getQuickPickItems(
        serviceUrl: string,
        options?: { hasLastSelected: boolean }
    ): Promise<Array<QuickPickItem & IDependenciesItem>> {
        if (this.dependencies.length === 0) {
            await this.initialize(await serviceManager.getAvailableDependencies(serviceUrl, this.bootVersion));
        }
        const ret: Array<QuickPickItem & IDependenciesItem> = [];
        if (this.selectedIds.length === 0) {
            if (options && options.hasLastSelected && this.lastselected) {
                const item = this.genLastSelectedItem(this.lastselected);
                if (item) {
                    ret.push(item);
                }
            }
        }
        ret.push({
            description: "",
            id: this.selectedIds.join(","),
            itemType: "selection",
            label: `Selected ${this.selectedIds.length} dependenc${this.selectedIds.length === 1 ? "y" : "ies"}`
        });

        const selectedDeps = this.getSelectedDependencies();
        if (selectedDeps.length > 0) {
            ret.push(newSeparator("Selected"));
            const selectedItems = selectedDeps.map((dep) => ({
                description: dep.group,
                id: dep.id,
                itemType: "dependency",
                label: `(selected) ${dep.name}`
            })) as (QuickPickItem & IDependenciesItem)[];
            ret.push(...selectedItems);
        }

        const unselectedDeps = this.getUnselectedDependencies();
        if (unselectedDeps.length > 0) {
            let group: string | undefined;
            for (const dep of unselectedDeps) {
                if (group !== undefined && group !== dep.group) {
                    group = dep.group;
                    ret.push(newSeparator(group));
                }
                ret.push({
                    description: dep.group,
                    itemType: "dependency",
                    label: dep.name,
                    id: dep.id
                });
            }
        }

        return ret;
    }

    public getSelectedDependencies(): IDependency[] {
        return this.selectedIds.map((id: string) => this.dict[id]).filter(Boolean);
    }

    public getUnselectedDependencies(): IDependency[] {
        return this.dependencies.filter((dep: IDependency) => this.selectedIds.indexOf(dep.id) < 0);
    }

    public toggleDependency(id: string): void {
        const index: number = this.selectedIds.indexOf(id);
        if (index >= 0) {
            this.selectedIds = this.selectedIds.filter((x: string) => x !== id);
        } else {
            this.selectedIds.push(id);
        }
    }

    private genLastSelectedItem(idList: string): (QuickPickItem & IDependenciesItem) | null {
        const availIdList: string[] = idList.split(",").filter((id: string) => this.dict[id]);
        const availNameList: string[] = availIdList.map((id: string) => this.dict[id].name).filter((v) => v !== undefined);
        if (availNameList?.length) {
            return {
                description: availNameList.join(", "),
                id: availIdList.join(","),
                itemType: "lastUsed",
                label: "$(clock) Last used"
            };
        } else {
            return null;
        }
    }
}

function newSeparator(name: string | undefined): any {
    return {
        label: name,
        itemType: "separator",
        id: name
    };
}

export interface IDependenciesItem {
    itemType: string;
    id: string;
}
