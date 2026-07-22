import tippy from "tippy.js";
import { TypedMsg, isUrlSupported, getEngineObjOfUrl, search_engine_t, SearchEngine, parseUrlToGetQuery, storageManager, fmtEngineTooltipHtml, float_orientation_t, float_position_t, MyStorage } from "./common";

browser.runtime.onMessage.addListener((_ev: any) => {
    const ev = _ev as TypedMsg
    const reply = (r: TypedMsg) => Promise.resolve(r)
    if (ev.type === 'getQueryStringFromPage') {
        const res: TypedMsg = { type: ev.type, data: smartGetQueryString() }
        console.log('send to background~', res)
        return Promise.resolve(res)
    }
})

function smartGetQueryString (): string {
    const engine = getEngineObjOfUrl(document.location.href)
    if (!engine) { return 'ERROR: Not supported search engine' }
    switch (engine.id) {
        case 'startpage': return startpageGetQueryString(engine)
        case 'yahoo-onesearch': return yahooOneSearchGetQueryString(engine)
        default: return parseUrlToGetQuery(engine, document.location.href)
    }
}

function startpageGetQueryString(engine: SearchEngine): string {
    // Startspage frequently suspect you are abusing them via bot.
    // So when #q is not found on DOM, still try to get keyword from URL
    const el = document.querySelector("#q") as HTMLInputElement
    if (!el) { return parseUrlToGetQuery(engine, document.location.href) || "ERROR: StartPage has changed its HTML structure, please open an issue on EngineSwitcher's Github" }
    return el.value
}
function yahooOneSearchGetQueryString(engine: SearchEngine): string {
    const el = document.querySelector("#yschsp") as HTMLInputElement
    if (!el) { return parseUrlToGetQuery(engine, document.location.href) || "ERROR: StartPage has changed its HTML structure, please open an issue on EngineSwitcher's Github" }
    return el.value
}

storageManager.getData().then((cfg) => {
    if (cfg.floatButton.enabled) {
        setupFloatBarAfterBodyReady(cfg)
    }
    if (cfg.extra.ecosiaEliminateNotifications) {
        ecosiaRemoveStupidAnnoyingNotificationBanner()
    }
})

function makeDebounceObject(fn: () => any, delay: number): {cancel: () => any, start: () => any} {
    let timeoutId = -1
    return {
        cancel: () => window.clearTimeout(timeoutId),
        start: () => {
            window.clearTimeout(timeoutId)
            timeoutId = window.setTimeout(fn, delay)
        }
    }
}

function ecosiaRemoveStupidAnnoyingNotificationBanner() {
    console.log('ecosia hack!')
    const mutObserver = new MutationObserver((arr, observer) => {
        const body = arr.find(mut =>
            mut.type === 'childList' &&
            mut.target.nodeType === Node.ELEMENT_NODE &&
            mut.target.nodeName === 'BODY'
        )
        if (body) {
            const styleEl = document.createElement('style')
            // Donno why there are two possible CSS classes to contain this shitty notification banner...
            styleEl.innerText = `
              .main-header .banner { display: none !important; }
              .js-notifications-banner { display: none !important; }
              .banner.cookie-notice { display: none !important; }
              .modal.privacy-modal { display: none !important; }
            `
            styleEl.className='engineSwitcherEcosiaHack'
            document.body.append(styleEl)

            mutObserver.disconnect()
            return  // Remember to do this...
        }
    })
    mutObserver.observe(document, {
        childList: true,
        subtree: true,  // false (or omit) to observe only changes to the parent node
    })
}

function createEngineLinkElem(engine: SearchEngine, query: string): HTMLAnchorElement {
    const kls = engine.hostname === location.hostname ? 'active' : ''
    const href = query ?
        engine.queryUrl.replace(/{}/, encodeURIComponent(query)) :
        `https://${engine.hostname}`
    const aEl = document.createElement('a')
    aEl.href = href
    aEl.className = kls
    aEl.target = "_self"
    const imgEl = document.createElement('img')
    imgEl.className = "iconImg"
    imgEl.src = engine.iconUrl
    aEl.appendChild(imgEl)
    tippy(aEl, {
        allowHTML: true,
        content: fmtEngineTooltipHtml(engine, 'content')
    })
    return aEl
}

async function getEnabledEngines(): Promise<SearchEngine[]> {
    const msg: TypedMsg = { type: 'getEnabledEnginesFromBg', data: [] }
    const res = await browser.runtime.sendMessage(msg) as TypedMsg
    if (res.type === 'getEnabledEnginesFromBg') {
        return res.data
    }
    return []
}

function removeFloatBar() {
    document.querySelectorAll('.engineSwitcherElem').forEach(x => x.remove() )
    const el = document.querySelector('#engineSwitcherBar')
    if (el) { el.remove() }
    // Clean body padding that we may have added
    document.body.style.paddingBottom = ''
    document.body.style.paddingRight = ''
    document.body.style.paddingLeft = ''
}

async function setupFloatBar(cfg: MyStorage) {
    removeFloatBar()
    const orientation: float_orientation_t = cfg.floatButton.orientation || 'horizontal'
    const position: float_position_t = cfg.floatButton.position || (orientation === 'vertical' ? 'right' : 'left')
    const isVertical = orientation === 'vertical'
    const isRight = position === 'right'

    const styleEl = document.createElement('style')
    styleEl.className = "engineSwitcherElem"
    const ICON_SIZE = 40
    const BAR_WIDTH = ICON_SIZE + 16 // padding + icon
    const ACTION_BTN_SIZE = 32 // narrow close + settings buttons

    // Shared CSS variables + dark mode
    const commonCss = `
    #engineSwitcherBar {
        --bg: #ffffff;
        --bgActive: #eeeeee;
        --bgHover: #eeeeee;
        --activeIndicator: #5599ff;
        --fg: #333333;
        --bd: #cccccc;
        position: fixed;
        z-index: 99999999999;
        background: var(--bg);
        border: 1px solid var(--bd);
        display: flex;
    }
    #engineSwitcherBar a {
        color: var(--fg);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 2px 10px;
        text-decoration: none;
        flex-shrink: 0;
    }
    #engineSwitcherBar a.closeBtn,
    #engineSwitcherBar a.settingsBtn {
        width: ${ACTION_BTN_SIZE}px;
        min-width: ${ACTION_BTN_SIZE}px;
        padding: 0;
        opacity: 0.75;
    }
    #engineSwitcherBar a.closeBtn:hover,
    #engineSwitcherBar a.settingsBtn:hover {
        opacity: 1;
        background: var(--bgActive);
    }
    #engineSwitcherBar a:hover {
        background: var(--bgActive);
    }
    #engineSwitcherBar a .iconImg {
        width: ${ICON_SIZE}px;
        min-width: ${ICON_SIZE}px;
        height: ${ICON_SIZE}px;
        object-fit: contain;
    }
    #engineSwitcherBar a.active {
        background: var(--bgActive);
        filter: brightness(0.9) saturate(0.6);
    }
    @media(prefers-color-scheme: dark) {
        #engineSwitcherBar {
            --bg: #000;
            --bgActive: #333333;
            --bgHover: #eeeeee;
            --activeIndicator: #999999;
            --fg: #666666;
            --bd: #666666;
        }
        #engineSwitcherBar img[src$='wikipedia.svg'],
        #engineSwitcherBar img[src$='yahoo-onesearch.png'],
        #engineSwitcherBar a.closeBtn svg,
        #engineSwitcherBar a.settingsBtn svg {
            filter: invert(100%);
        }
    }
    `

    let layoutCss = ''
    if (isVertical) {
        const side = isRight ? 'right' : 'left'
        const opposite = isRight ? 'left' : 'right'
        const activeBorder = isRight ? 'border-left' : 'border-right'
        layoutCss = `
        #engineSwitcherBar {
            flex-direction: column;
            top: 0;
            ${side}: 0;
            bottom: 0;
            ${opposite}: auto;
            width: ${BAR_WIDTH}px;
            max-height: 100vh;
            height: 100vh;
            border-${opposite}: 1px solid var(--bd);
            border-${side}: none;
            border-top: none;
            border-bottom: none;
        }
        #engineSwitcherBar .scrollArea {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            display: flex;
            flex-direction: column;
            width: 100%;
            max-height: calc(100vh - ${ACTION_BTN_SIZE * 2}px);
        }
        #engineSwitcherBar a {
            padding: 8px 4px;
            width: 100%;
            box-sizing: border-box;
        }
        #engineSwitcherBar a.closeBtn,
        #engineSwitcherBar a.settingsBtn {
            width: 100%;
            height: ${ACTION_BTN_SIZE}px;
            min-height: ${ACTION_BTN_SIZE}px;
        }
        #engineSwitcherBar a.closeBtn {
            border-bottom: 1px solid var(--bd);
        }
        #engineSwitcherBar a.settingsBtn {
            border-top: 1px solid var(--bd);
        }
        #engineSwitcherBar .active {
            ${activeBorder}: 3px solid var(--activeIndicator);
            border-bottom: none;
        }
        body {
            padding-${side}: ${BAR_WIDTH}px !important;
        }
        `
    } else {
        // Horizontal bottom bar
        const side = isRight ? 'right' : 'left'
        const opposite = isRight ? 'left' : 'right'
        layoutCss = `
        #engineSwitcherBar {
            flex-direction: row;
            bottom: 0;
            ${side}: 0;
            ${opposite}: auto;
            top: auto;
            width: auto;
            max-width: 100vw;
        }
        #engineSwitcherBar .scrollArea {
            max-width: calc(100vw - ${ACTION_BTN_SIZE * 2}px);
            overflow-x: auto;
            overflow-y: hidden;
            display: flex;
            flex-direction: row;
            width: 100%;
        }
        #engineSwitcherBar a.closeBtn,
        #engineSwitcherBar a.settingsBtn {
            width: ${ACTION_BTN_SIZE}px;
            height: auto;
        }
        #engineSwitcherBar .active {
            border-bottom: 3px solid var(--activeIndicator);
            border-left: none;
            border-right: none;
        }
        body {
            padding-bottom: ${ICON_SIZE + 8}px !important;
        }
        `
    }

    styleEl.textContent = commonCss + layoutCss

    const floatEl = document.createElement('div')
    floatEl.id = 'engineSwitcherBar'
    floatEl.className = `engineSwitcherElem ${isVertical ? 'vertical' : 'horizontal'} pos-${position}`

    const enabledEngines = await getEnabledEngines()
    const query = smartGetQueryString()

    // Close icon (X)
    const closeIconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12">
        <path fill="currentColor" fill-rule="nonzero" d="M7.426 6l4.285 4.284a1 1 0 0 1 0 1.415l-.012.012a1 1 0 0 1-1.415 0L6 7.426l-4.284 4.285a1 1 0 0 1-1.415 0l-.012-.012a1 1 0 0 1 0-1.415L4.574 6 .289 1.716A1 1 0 0 1 .29.3L.301.29a1 1 0 0 1 1.415 0L6 4.574 10.284.289a1 1 0 0 1 1.415 0l.012.012a1 1 0 0 1 0 1.415L7.426 6z"></path>
    </svg>`
    const closeBtn = document.createElement('a')
    closeBtn.innerHTML = closeIconSvg
    closeBtn.className = 'closeBtn'
    closeBtn.title = 'Close Engine Switcher'
    closeBtn.onclick = function () { removeFloatBar() }

    // Settings gear (narrow)
    const settingsIconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>`
    const settingsBtn = document.createElement('a')
    settingsBtn.innerHTML = settingsIconSvg
    settingsBtn.className = 'settingsBtn'
    settingsBtn.title = 'Open Engine Switcher settings'
    settingsBtn.onclick = function (e) {
        e.preventDefault()
        const msg: TypedMsg = { type: 'openOptionsPage' }
        browser.runtime.sendMessage(msg)
    }

    floatEl.innerHTML = `<div class="scrollArea"></div>`
    const scrollAreaEl = floatEl.querySelector('.scrollArea')!
    for (const eng of enabledEngines) {
        scrollAreaEl.appendChild(createEngineLinkElem(eng, query))
    }

    // Order: close | engines | settings
    floatEl.prepend(closeBtn)
    floatEl.appendChild(settingsBtn)

    document.body.appendChild(floatEl)
    document.head.appendChild(styleEl)
}

function setupFloatBarAfterBodyReady(cfg: MyStorage) {
    // FIXME: A debounce as workaround for incomprehensible behavior of DOM of Brave...
    const debounceSetupFloatBar = makeDebounceObject(() => {
        setupFloatBar(cfg)
    }, 1000)
    debounceSetupFloatBar.start()
    const mutObserver = new MutationObserver((arr, observer) => {
        const body = arr.find(mut =>
            mut.type === 'childList' &&
            mut.target.nodeType === Node.ELEMENT_NODE &&
            mut.target.nodeName === 'BODY'
        )
        if (body) {
            setupFloatBar(cfg)
            debounceSetupFloatBar.cancel()
            mutObserver.disconnect()
            return
        }
    })

    mutObserver.observe(document, {
        childList: true,
        subtree: true,
    })
}
