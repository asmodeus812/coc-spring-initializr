// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { IDependencyNode } from "../Interfaces";

export class DependencyNode {
    public groupId: string;
    public artifactId: string;
    public version?: string;
    public scope?: string;

    constructor(gid: string, aid: string, ver?: string, scp?: string) {
        this.groupId = gid;
        this.artifactId = aid;
        this.version = ver;
        this.scope = scp;
    }

    public get node(): IDependencyNode {
        const result: IDependencyNode = {
            groupId: [this.groupId],
            artifactId: [this.artifactId],
            version: [],
            scope: []
        };
        if (this.version) {
            result.version = [this.version];
        }
        if (this.scope) {
            result.scope = [this.scope];
        }
        return result;
    }
}
