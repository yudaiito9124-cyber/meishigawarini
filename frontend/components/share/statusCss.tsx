"use client";

export const shortCardStatusList = [
    "short.una",
    "short.lin",
    "short.act",
    "short.use",
    "short.shi",
    "short.com",
    "short.exp",
    "short.ban",
    "short.pro",
];

export const shortToStatus: Record<string, string> = {
    "short.una": "unassigned",
    "short.lin": "linked",
    "short.act": "active",
    "short.use": "used",
    "short.shi": "shipped",
    "short.com": "completed",
    "short.exp": "expired",
    "short.ban": "banned",
    "short.pro": "promotion",
    "short.ord": "ordered",
    "short.pri": "printing",
    "short.rej": "rejected",
    "short.can": "cancelled"
};

export const cardStatusList = shortCardStatusList.map((s) => shortToStatus[s] ?? s);

export const cardStatusCss = (status: string, bg: boolean = true, border: boolean = true, text: boolean = true) => {
    // Map internal names (unassigned, linked, etc.) back to short keys for CSS lookup
    const normalizedStatus = status.startsWith('short.')
        ? status
        : Object.keys(shortToStatus).find(key => shortToStatus[key] === status.toLowerCase()) || status;

    switch (normalizedStatus) {
        case 'short.una': case 'unassigned': return ((bg ? 'bg-gray-100    ' : '') + (border ? 'border-gray-200   ' : '') + (text ? ' text-gray-700   ' : '')).trim();
        case 'short.lin': case 'linked': return ((bg ? 'bg-emerald-100 ' : '') + (border ? 'border-emerald-200' : '') + (text ? ' text-emerald-800' : '')).trim();
        case 'short.act': case 'active': return ((bg ? 'bg-yellow-100  ' : '') + (border ? 'border-yellow-200 ' : '') + (text ? ' text-yellow-800 ' : '')).trim();
        case 'short.use': case 'used': return ((bg ? 'bg-orange-100  ' : '') + (border ? 'border-orange-200 ' : '') + (text ? ' text-orange-800 ' : '')).trim();
        case 'short.shi': case 'shipped': return ((bg ? 'bg-indigo-100  ' : '') + (border ? 'border-indigo-200 ' : '') + (text ? ' text-indigo-800 ' : '')).trim();
        case 'short.com': case 'completed': return ((bg ? 'bg-purple-100  ' : '') + (border ? 'border-purple-200 ' : '') + (text ? ' text-purple-800 ' : '')).trim();
        case 'short.exp': case 'expired': return ((bg ? 'bg-gray-200    ' : '') + (border ? 'border-gray-300   ' : '') + (text ? ' text-gray-800   ' : '')).trim();
        case 'short.ban': case 'banned': return ((bg ? 'bg-red-100     ' : '') + (border ? 'border-red-200    ' : '') + (text ? ' text-red-800    ' : '')).trim();
        case 'short.pro': case 'promotion': return ((bg ? 'bg-green-100   ' : '') + (border ? 'border-green-200  ' : '') + (text ? ' text-green-800  ' : '')).trim();
        default: return ((bg ? 'bg-gray-100 ' : '') + (border ? 'border-gray-200' : '') + (text ? ' text-gray-700' : '')).trim();
    }
}