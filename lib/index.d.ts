import { Context, Schema } from 'koishi';
export declare const name = "ai-image";
export declare const inject: {
    required: string[];
    optional: string[];
};
declare module 'koishi' {
    interface Tables {
        ai_image_blacklist: BlacklistEntry;
    }
    interface Context {
        assets?: any;
    }
}
interface BlacklistEntry {
    id: string;
    createdAt: Date;
}
export declare const ModelConfig: Schema<Schemastery.ObjectS<{
    model: Schema<string, string>;
    txt2imgModel: Schema<string, string>;
    img2imgModel: Schema<string, string>;
    apiKey: Schema<string, string>;
    apiType: Schema<"auto" | "chat" | "images", "auto" | "chat" | "images">;
    baseUrl: Schema<string, string>;
    imageRefField: Schema<"image" | "image_url" | "reference_image", "image" | "image_url" | "reference_image">;
    subModels: Schema<Schemastery.ObjectS<{
        enable: Schema<boolean, boolean>;
        name: Schema<string, string>;
        model: Schema<string, string>;
        apiKey: Schema<string, string>;
        apiType: Schema<"auto" | "chat" | "images", "auto" | "chat" | "images">;
        baseUrl: Schema<string, string>;
        imageRefField: Schema<"auto" | "image" | "image_url" | "reference_image", "auto" | "image" | "image_url" | "reference_image">;
        txt2imgCommand: Schema<string, string>;
        img2imgCommand: Schema<string, string>;
    }>[], Schemastery.ObjectT<{
        enable: Schema<boolean, boolean>;
        name: Schema<string, string>;
        model: Schema<string, string>;
        apiKey: Schema<string, string>;
        apiType: Schema<"auto" | "chat" | "images", "auto" | "chat" | "images">;
        baseUrl: Schema<string, string>;
        imageRefField: Schema<"auto" | "image" | "image_url" | "reference_image", "auto" | "image" | "image_url" | "reference_image">;
        txt2imgCommand: Schema<string, string>;
        img2imgCommand: Schema<string, string>;
    }>[]>;
}>, Schemastery.ObjectT<{
    model: Schema<string, string>;
    txt2imgModel: Schema<string, string>;
    img2imgModel: Schema<string, string>;
    apiKey: Schema<string, string>;
    apiType: Schema<"auto" | "chat" | "images", "auto" | "chat" | "images">;
    baseUrl: Schema<string, string>;
    imageRefField: Schema<"image" | "image_url" | "reference_image", "image" | "image_url" | "reference_image">;
    subModels: Schema<Schemastery.ObjectS<{
        enable: Schema<boolean, boolean>;
        name: Schema<string, string>;
        model: Schema<string, string>;
        apiKey: Schema<string, string>;
        apiType: Schema<"auto" | "chat" | "images", "auto" | "chat" | "images">;
        baseUrl: Schema<string, string>;
        imageRefField: Schema<"auto" | "image" | "image_url" | "reference_image", "auto" | "image" | "image_url" | "reference_image">;
        txt2imgCommand: Schema<string, string>;
        img2imgCommand: Schema<string, string>;
    }>[], Schemastery.ObjectT<{
        enable: Schema<boolean, boolean>;
        name: Schema<string, string>;
        model: Schema<string, string>;
        apiKey: Schema<string, string>;
        apiType: Schema<"auto" | "chat" | "images", "auto" | "chat" | "images">;
        baseUrl: Schema<string, string>;
        imageRefField: Schema<"auto" | "image" | "image_url" | "reference_image", "auto" | "image" | "image_url" | "reference_image">;
        txt2imgCommand: Schema<string, string>;
        img2imgCommand: Schema<string, string>;
    }>[]>;
}>>;
export declare const BaseConfig: Schema<Schemastery.ObjectS<{
    debug: Schema<boolean, boolean>;
    apiStrategy: Schema<"sequence" | "roundrobin", "sequence" | "roundrobin">;
    timeout: Schema<number, number>;
    rateLimit: Schema<number, number>;
    imgWaitTime: Schema<number, number>;
    maxImages: Schema<number, number>;
    enableImgCompress: Schema<boolean, boolean>;
    imgMaxWidth: Schema<number, number>;
    imgMaxHeight: Schema<number, number>;
    imgQuality: Schema<number, number>;
    imgMaxFileSize: Schema<number, number>;
    enableImg2ImgBase64: Schema<boolean, boolean>;
    apiList: Schema<Schemastery.ObjectS<{
        enable: Schema<boolean, boolean>;
        apiKey: Schema<string, string>;
        baseUrl: Schema<string, string>;
    }>[], Schemastery.ObjectT<{
        enable: Schema<boolean, boolean>;
        apiKey: Schema<string, string>;
        baseUrl: Schema<string, string>;
    }>[]>;
    enableTxt2Img: Schema<boolean, boolean>;
    enableImg2Img: Schema<boolean, boolean>;
    command: Schema<string, string>;
    aliases: Schema<string[], string[]>;
    img2imgCommand: Schema<string, string>;
    img2imgAliases: Schema<string[], string[]>;
    txt2imgPrompt: Schema<string, string>;
    img2imgPrompt: Schema<string, string>;
    blacklistAdmins: Schema<string[], string[]>;
}>, Schemastery.ObjectT<{
    debug: Schema<boolean, boolean>;
    apiStrategy: Schema<"sequence" | "roundrobin", "sequence" | "roundrobin">;
    timeout: Schema<number, number>;
    rateLimit: Schema<number, number>;
    imgWaitTime: Schema<number, number>;
    maxImages: Schema<number, number>;
    enableImgCompress: Schema<boolean, boolean>;
    imgMaxWidth: Schema<number, number>;
    imgMaxHeight: Schema<number, number>;
    imgQuality: Schema<number, number>;
    imgMaxFileSize: Schema<number, number>;
    enableImg2ImgBase64: Schema<boolean, boolean>;
    apiList: Schema<Schemastery.ObjectS<{
        enable: Schema<boolean, boolean>;
        apiKey: Schema<string, string>;
        baseUrl: Schema<string, string>;
    }>[], Schemastery.ObjectT<{
        enable: Schema<boolean, boolean>;
        apiKey: Schema<string, string>;
        baseUrl: Schema<string, string>;
    }>[]>;
    enableTxt2Img: Schema<boolean, boolean>;
    enableImg2Img: Schema<boolean, boolean>;
    command: Schema<string, string>;
    aliases: Schema<string[], string[]>;
    img2imgCommand: Schema<string, string>;
    img2imgAliases: Schema<string[], string[]>;
    txt2imgPrompt: Schema<string, string>;
    img2imgPrompt: Schema<string, string>;
    blacklistAdmins: Schema<string[], string[]>;
}>>;
export declare const PresetConfig: Schema<Schemastery.ObjectS<{
    enablePresets: Schema<boolean, boolean>;
    presets: Schema<Schemastery.ObjectS<{
        enable: Schema<boolean, boolean>;
        text: Schema<string, string>;
        command: Schema<string, string>;
        keyword: Schema<string, string>;
        enableKeywordMatch: Schema<boolean, boolean>;
    }>[], Schemastery.ObjectT<{
        enable: Schema<boolean, boolean>;
        text: Schema<string, string>;
        command: Schema<string, string>;
        keyword: Schema<string, string>;
        enableKeywordMatch: Schema<boolean, boolean>;
    }>[]>;
}>, Schemastery.ObjectT<{
    enablePresets: Schema<boolean, boolean>;
    presets: Schema<Schemastery.ObjectS<{
        enable: Schema<boolean, boolean>;
        text: Schema<string, string>;
        command: Schema<string, string>;
        keyword: Schema<string, string>;
        enableKeywordMatch: Schema<boolean, boolean>;
    }>[], Schemastery.ObjectT<{
        enable: Schema<boolean, boolean>;
        text: Schema<string, string>;
        command: Schema<string, string>;
        keyword: Schema<string, string>;
        enableKeywordMatch: Schema<boolean, boolean>;
    }>[]>;
}>>;
export declare const MessageConfig: Schema<Schemastery.ObjectS<{
    messages: Schema<Schemastery.ObjectS<{
        generating: Schema<string, string>;
        waitImage: Schema<string, string>;
        timeout: Schema<string, string>;
        empty: Schema<string, string>;
        noApi: Schema<string, string>;
        fail: Schema<string, string>;
        modelTextOnly: Schema<string, string>;
        needAssets: Schema<string, string>;
        txt2imgDisabled: Schema<string, string>;
        img2imgDisabled: Schema<string, string>;
        rateLimit: Schema<string, string>;
        alreadyWaiting: Schema<string, string>;
        multiImageReceived: Schema<string, string>;
        multiImageLimit: Schema<string, string>;
        noImageReceived: Schema<string, string>;
        blacklisted: Schema<string, string>;
        noPermission: Schema<string, string>;
        blacklistAddSuccess: Schema<string, string>;
        blacklistRemoveSuccess: Schema<string, string>;
        blacklistAddFail: Schema<string, string>;
        blacklistRemoveFail: Schema<string, string>;
        invalidUserId: Schema<string, string>;
        blacklistListEmpty: Schema<string, string>;
        blacklistListTitle: Schema<string, string>;
    }>, Schemastery.ObjectT<{
        generating: Schema<string, string>;
        waitImage: Schema<string, string>;
        timeout: Schema<string, string>;
        empty: Schema<string, string>;
        noApi: Schema<string, string>;
        fail: Schema<string, string>;
        modelTextOnly: Schema<string, string>;
        needAssets: Schema<string, string>;
        txt2imgDisabled: Schema<string, string>;
        img2imgDisabled: Schema<string, string>;
        rateLimit: Schema<string, string>;
        alreadyWaiting: Schema<string, string>;
        multiImageReceived: Schema<string, string>;
        multiImageLimit: Schema<string, string>;
        noImageReceived: Schema<string, string>;
        blacklisted: Schema<string, string>;
        noPermission: Schema<string, string>;
        blacklistAddSuccess: Schema<string, string>;
        blacklistRemoveSuccess: Schema<string, string>;
        blacklistAddFail: Schema<string, string>;
        blacklistRemoveFail: Schema<string, string>;
        invalidUserId: Schema<string, string>;
        blacklistListEmpty: Schema<string, string>;
        blacklistListTitle: Schema<string, string>;
    }>>;
}>, Schemastery.ObjectT<{
    messages: Schema<Schemastery.ObjectS<{
        generating: Schema<string, string>;
        waitImage: Schema<string, string>;
        timeout: Schema<string, string>;
        empty: Schema<string, string>;
        noApi: Schema<string, string>;
        fail: Schema<string, string>;
        modelTextOnly: Schema<string, string>;
        needAssets: Schema<string, string>;
        txt2imgDisabled: Schema<string, string>;
        img2imgDisabled: Schema<string, string>;
        rateLimit: Schema<string, string>;
        alreadyWaiting: Schema<string, string>;
        multiImageReceived: Schema<string, string>;
        multiImageLimit: Schema<string, string>;
        noImageReceived: Schema<string, string>;
        blacklisted: Schema<string, string>;
        noPermission: Schema<string, string>;
        blacklistAddSuccess: Schema<string, string>;
        blacklistRemoveSuccess: Schema<string, string>;
        blacklistAddFail: Schema<string, string>;
        blacklistRemoveFail: Schema<string, string>;
        invalidUserId: Schema<string, string>;
        blacklistListEmpty: Schema<string, string>;
        blacklistListTitle: Schema<string, string>;
    }>, Schemastery.ObjectT<{
        generating: Schema<string, string>;
        waitImage: Schema<string, string>;
        timeout: Schema<string, string>;
        empty: Schema<string, string>;
        noApi: Schema<string, string>;
        fail: Schema<string, string>;
        modelTextOnly: Schema<string, string>;
        needAssets: Schema<string, string>;
        txt2imgDisabled: Schema<string, string>;
        img2imgDisabled: Schema<string, string>;
        rateLimit: Schema<string, string>;
        alreadyWaiting: Schema<string, string>;
        multiImageReceived: Schema<string, string>;
        multiImageLimit: Schema<string, string>;
        noImageReceived: Schema<string, string>;
        blacklisted: Schema<string, string>;
        noPermission: Schema<string, string>;
        blacklistAddSuccess: Schema<string, string>;
        blacklistRemoveSuccess: Schema<string, string>;
        blacklistAddFail: Schema<string, string>;
        blacklistRemoveFail: Schema<string, string>;
        invalidUserId: Schema<string, string>;
        blacklistListEmpty: Schema<string, string>;
        blacklistListTitle: Schema<string, string>;
    }>>;
}>>;
export declare const Config: Schema<Schemastery.ObjectS<{
    model: Schema<string, string>;
    txt2imgModel: Schema<string, string>;
    img2imgModel: Schema<string, string>;
    apiKey: Schema<string, string>;
    apiType: Schema<"auto" | "chat" | "images", "auto" | "chat" | "images">;
    baseUrl: Schema<string, string>;
    imageRefField: Schema<"image" | "image_url" | "reference_image", "image" | "image_url" | "reference_image">;
    subModels: Schema<Schemastery.ObjectS<{
        enable: Schema<boolean, boolean>;
        name: Schema<string, string>;
        model: Schema<string, string>;
        apiKey: Schema<string, string>;
        apiType: Schema<"auto" | "chat" | "images", "auto" | "chat" | "images">;
        baseUrl: Schema<string, string>;
        imageRefField: Schema<"auto" | "image" | "image_url" | "reference_image", "auto" | "image" | "image_url" | "reference_image">;
        txt2imgCommand: Schema<string, string>;
        img2imgCommand: Schema<string, string>;
    }>[], Schemastery.ObjectT<{
        enable: Schema<boolean, boolean>;
        name: Schema<string, string>;
        model: Schema<string, string>;
        apiKey: Schema<string, string>;
        apiType: Schema<"auto" | "chat" | "images", "auto" | "chat" | "images">;
        baseUrl: Schema<string, string>;
        imageRefField: Schema<"auto" | "image" | "image_url" | "reference_image", "auto" | "image" | "image_url" | "reference_image">;
        txt2imgCommand: Schema<string, string>;
        img2imgCommand: Schema<string, string>;
    }>[]>;
}> | Schemastery.ObjectS<{
    debug: Schema<boolean, boolean>;
    apiStrategy: Schema<"sequence" | "roundrobin", "sequence" | "roundrobin">;
    timeout: Schema<number, number>;
    rateLimit: Schema<number, number>;
    imgWaitTime: Schema<number, number>;
    maxImages: Schema<number, number>;
    enableImgCompress: Schema<boolean, boolean>;
    imgMaxWidth: Schema<number, number>;
    imgMaxHeight: Schema<number, number>;
    imgQuality: Schema<number, number>;
    imgMaxFileSize: Schema<number, number>;
    enableImg2ImgBase64: Schema<boolean, boolean>;
    apiList: Schema<Schemastery.ObjectS<{
        enable: Schema<boolean, boolean>;
        apiKey: Schema<string, string>;
        baseUrl: Schema<string, string>;
    }>[], Schemastery.ObjectT<{
        enable: Schema<boolean, boolean>;
        apiKey: Schema<string, string>;
        baseUrl: Schema<string, string>;
    }>[]>;
    enableTxt2Img: Schema<boolean, boolean>;
    enableImg2Img: Schema<boolean, boolean>;
    command: Schema<string, string>;
    aliases: Schema<string[], string[]>;
    img2imgCommand: Schema<string, string>;
    img2imgAliases: Schema<string[], string[]>;
    txt2imgPrompt: Schema<string, string>;
    img2imgPrompt: Schema<string, string>;
    blacklistAdmins: Schema<string[], string[]>;
}> | Schemastery.ObjectS<{
    enablePresets: Schema<boolean, boolean>;
    presets: Schema<Schemastery.ObjectS<{
        enable: Schema<boolean, boolean>;
        text: Schema<string, string>;
        command: Schema<string, string>;
        keyword: Schema<string, string>;
        enableKeywordMatch: Schema<boolean, boolean>;
    }>[], Schemastery.ObjectT<{
        enable: Schema<boolean, boolean>;
        text: Schema<string, string>;
        command: Schema<string, string>;
        keyword: Schema<string, string>;
        enableKeywordMatch: Schema<boolean, boolean>;
    }>[]>;
}> | Schemastery.ObjectS<{
    messages: Schema<Schemastery.ObjectS<{
        generating: Schema<string, string>;
        waitImage: Schema<string, string>;
        timeout: Schema<string, string>;
        empty: Schema<string, string>;
        noApi: Schema<string, string>;
        fail: Schema<string, string>;
        modelTextOnly: Schema<string, string>;
        needAssets: Schema<string, string>;
        txt2imgDisabled: Schema<string, string>;
        img2imgDisabled: Schema<string, string>;
        rateLimit: Schema<string, string>;
        alreadyWaiting: Schema<string, string>;
        multiImageReceived: Schema<string, string>;
        multiImageLimit: Schema<string, string>;
        noImageReceived: Schema<string, string>;
        blacklisted: Schema<string, string>;
        noPermission: Schema<string, string>;
        blacklistAddSuccess: Schema<string, string>;
        blacklistRemoveSuccess: Schema<string, string>;
        blacklistAddFail: Schema<string, string>;
        blacklistRemoveFail: Schema<string, string>;
        invalidUserId: Schema<string, string>;
        blacklistListEmpty: Schema<string, string>;
        blacklistListTitle: Schema<string, string>;
    }>, Schemastery.ObjectT<{
        generating: Schema<string, string>;
        waitImage: Schema<string, string>;
        timeout: Schema<string, string>;
        empty: Schema<string, string>;
        noApi: Schema<string, string>;
        fail: Schema<string, string>;
        modelTextOnly: Schema<string, string>;
        needAssets: Schema<string, string>;
        txt2imgDisabled: Schema<string, string>;
        img2imgDisabled: Schema<string, string>;
        rateLimit: Schema<string, string>;
        alreadyWaiting: Schema<string, string>;
        multiImageReceived: Schema<string, string>;
        multiImageLimit: Schema<string, string>;
        noImageReceived: Schema<string, string>;
        blacklisted: Schema<string, string>;
        noPermission: Schema<string, string>;
        blacklistAddSuccess: Schema<string, string>;
        blacklistRemoveSuccess: Schema<string, string>;
        blacklistAddFail: Schema<string, string>;
        blacklistRemoveFail: Schema<string, string>;
        invalidUserId: Schema<string, string>;
        blacklistListEmpty: Schema<string, string>;
        blacklistListTitle: Schema<string, string>;
    }>>;
}>, {
    model: string;
    txt2imgModel: string;
    img2imgModel: string;
    apiKey: string;
    apiType: "auto" | "chat" | "images";
    baseUrl: string;
    imageRefField: "image" | "image_url" | "reference_image";
    subModels: Schemastery.ObjectT<{
        enable: Schema<boolean, boolean>;
        name: Schema<string, string>;
        model: Schema<string, string>;
        apiKey: Schema<string, string>;
        apiType: Schema<"auto" | "chat" | "images", "auto" | "chat" | "images">;
        baseUrl: Schema<string, string>;
        imageRefField: Schema<"auto" | "image" | "image_url" | "reference_image", "auto" | "image" | "image_url" | "reference_image">;
        txt2imgCommand: Schema<string, string>;
        img2imgCommand: Schema<string, string>;
    }>[];
} & import("cosmokit", { with: { "resolution-mode": "import" } }).Dict & {
    debug: boolean;
    apiStrategy: "sequence" | "roundrobin";
    timeout: number;
    rateLimit: number;
    imgWaitTime: number;
    maxImages: number;
    enableImgCompress: boolean;
    imgMaxWidth: number;
    imgMaxHeight: number;
    imgQuality: number;
    imgMaxFileSize: number;
    enableImg2ImgBase64: boolean;
    apiList: Schemastery.ObjectT<{
        enable: Schema<boolean, boolean>;
        apiKey: Schema<string, string>;
        baseUrl: Schema<string, string>;
    }>[];
    enableTxt2Img: boolean;
    enableImg2Img: boolean;
    command: string;
    aliases: string[];
    img2imgCommand: string;
    img2imgAliases: string[];
    txt2imgPrompt: string;
    img2imgPrompt: string;
    blacklistAdmins: string[];
} & {
    enablePresets: boolean;
    presets: Schemastery.ObjectT<{
        enable: Schema<boolean, boolean>;
        text: Schema<string, string>;
        command: Schema<string, string>;
        keyword: Schema<string, string>;
        enableKeywordMatch: Schema<boolean, boolean>;
    }>[];
} & {
    messages: Schemastery.ObjectT<{
        generating: Schema<string, string>;
        waitImage: Schema<string, string>;
        timeout: Schema<string, string>;
        empty: Schema<string, string>;
        noApi: Schema<string, string>;
        fail: Schema<string, string>;
        modelTextOnly: Schema<string, string>;
        needAssets: Schema<string, string>;
        txt2imgDisabled: Schema<string, string>;
        img2imgDisabled: Schema<string, string>;
        rateLimit: Schema<string, string>;
        alreadyWaiting: Schema<string, string>;
        multiImageReceived: Schema<string, string>;
        multiImageLimit: Schema<string, string>;
        noImageReceived: Schema<string, string>;
        blacklisted: Schema<string, string>;
        noPermission: Schema<string, string>;
        blacklistAddSuccess: Schema<string, string>;
        blacklistRemoveSuccess: Schema<string, string>;
        blacklistAddFail: Schema<string, string>;
        blacklistRemoveFail: Schema<string, string>;
        invalidUserId: Schema<string, string>;
        blacklistListEmpty: Schema<string, string>;
        blacklistListTitle: Schema<string, string>;
    }>;
}>;
export type Config = any;
export declare function apply(ctx: Context, cfg: any): Promise<void>;
export {};
