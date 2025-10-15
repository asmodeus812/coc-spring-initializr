// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri } from "coc.nvim";
import * as fse from "fs-extra";

export async function isDirectory(uri: Uri | string): Promise<boolean | undefined> {
    try {
        const path = typeof uri === "string" ? uri : uri.fsPath;
        return (await fse.stat(path)).isDirectory();
    } catch (error) {
        return false;
    }
}

export async function isFile(uri: Uri | string): Promise<boolean | undefined> {
    try {
        const path = typeof uri === "string" ? uri : uri.fsPath;
        return (await fse.stat(path)).isFile();
    } catch (error) {
        return false;
    }
}

export async function pathExists(uri: Uri | string): Promise<boolean> {
    try {
        const path = typeof uri === "string" ? uri : uri.fsPath;
        await fse.exists(path);
        return true;
    } catch (error) {
        return false;
    }
}
