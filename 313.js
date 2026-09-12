class S311 extends ComicSource {
    name = "311漫画"
    key = "s311_com"
    version = "1.0.0"
    minAppVersion = "1.2.2"
    url = "https://www.311s.com/"

    settings = {
        domain: {
            title: "站点域名",
            type: "input",
            default: "www.311s.com"
        }
    }

    get baseUrl() {
        let domain = this.loadSetting("domain") || "www.311s.com"
        domain = String(domain).trim()
        domain = domain.replace(/^https?:\/\//i, "")
        domain = domain.replace(/\/+$/, "")
        return "https://" + domain
    }

    get requestHeaders() {
        return {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
            "referer": this.baseUrl + "/"
        }
    }

    search = {
        load: async (keyword, options, page) => {
            let url = this.baseUrl + "/search?key=" + encodeURIComponent(keyword) + "&page=" + page
            let res = await Network.get(url, this.requestHeaders)
            if (res.status !== 200) throw "搜索失败: " + res.status
            let doc = new HtmlDocument(res.body)
            let comics = this.parseComics(doc)
            for (let comic of comics) {
                try {
                    let detail = await Network.get(this.baseUrl + comic.id, this.requestHeaders)
                    if (detail.status === 200) {
                        let detailDoc = new HtmlDocument(detail.body)
                        let image = detailDoc.querySelector('meta[property="og:image"]')
                        if (image && image.attributes && image.attributes.content) {
                            comic.cover = image.attributes.content
                        }
                    }
                } catch (error) {
                    // 保留搜索页缩略图作为回退
                }
            }
            return {
                comics: comics,
                maxPage: comics.length > 0 ? page + 1 : page
            }
        },
        optionList: [],
        enableTagsSuggestions: false
    }

    category = {
        title: "311漫画",
        enableRankingPage: false,
        parts: [{
            name: "分类",
            type: "fixed",
            categories: [
                { label: "最新", target: { page: "category", attributes: { category: "latest", param: "/" } } },
                { label: "热门", target: { page: "category", attributes: { category: "popular", param: "/hot" } } },
                { label: "完结", target: { page: "category", attributes: { category: "finished", param: "/finish" } } }
            ]
        }]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let url = this.baseUrl + (param || "/")
            if (page > 1) url += (url.indexOf("?") >= 0 ? "&" : "?") + "page=" + page
            let res = await Network.get(url, this.requestHeaders)
            if (res.status !== 200) throw "分类加载失败: " + res.status
            let doc = new HtmlDocument(res.body)
            let comics = this.parseComics(doc)
            return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
        }
    }

    comic = {
        idMatch: "^(https?://www\\.311s\\.com)?/comic_[0-9]+\\.html$",
        link: {
            domains: ["www.311s.com"],
            linkToId: (url) => url
        },

        onThumbnailLoad: (url) => ({
            headers: this.requestHeaders
        }),

        onImageLoad: async (url, comicId, epId) => ({
            headers: {
                "user-agent": this.requestHeaders["user-agent"],
                "referer": this.baseUrl + "/"
            }
        }),

        loadInfo: async (id) => {
            let url = this.normalizeComicUrl(id)
            let res = await Network.get(url, this.requestHeaders)
            if (res.status !== 200) throw "详情加载失败: " + res.status
            let doc = new HtmlDocument(res.body)
            let title = this.text(doc.querySelector("h1"))
            if (!title) title = this.text(doc.querySelector(".comic-title"))
            if (!title) title = "未知漫画"

            let cover = ""
            let meta = doc.querySelector('meta[property="og:image"]')
            if (meta && meta.attributes) cover = this.absoluteUrl(meta.attributes.content || "")

            let chapters = {}
            let links = doc.querySelectorAll("a")
            for (let link of links) {
                let match = String(link.attributes.href || "").match(/chapter_([0-9]+)_([0-9]+)\.html/i)
                if (match) {
                    let chapterId = match[1] + "@" + match[2]
                    chapters[chapterId] = this.text(link) || match[2]
                }
            }
            if (Object.keys(chapters).length === 0) throw "没有找到章节"
            return new ComicDetails({
                title: title,
                cover: cover,
                tags: {},
                chapters: chapters,
                url: url
            })
        },

        loadEp: async (comicId, epId) => {
            let parts = String(epId).split("@")
            if (parts.length !== 2) throw "章节 ID 无效"
            let url = this.baseUrl + "/chapter_" + parts[0] + "_" + parts[1] + ".html"
            let res = await Network.get(url, this.requestHeaders)
            if (res.status !== 200) throw "章节加载失败: " + res.status
            let doc = new HtmlDocument(res.body)
            let images = []
            let seen = {}
            for (let img of doc.querySelectorAll("img")) {
                let attrs = img.attributes || {}
                let image = attrs["data-original"] || attrs["data-src"] || attrs["data-lazy-src"] || attrs.src || ""
                image = this.absoluteUrl(image)
                if (image && !seen[image] && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(image)) {
                    seen[image] = true
                    images.push(image)
                }
            }
            if (images.length === 0) throw "没有找到章节图片"
            return { images: images }
        }
    }

    normalizeComicUrl(id) {
        let value = String(id || "")
        if (/^https?:\/\//i.test(value)) return value
        return this.absoluteUrl(value)
    }

    absoluteUrl(value) {
        if (!value) return ""
        value = String(value).trim()
        if (/^https?:\/\//i.test(value)) return value
        if (value.indexOf("//") === 0) return "https:" + value
        return this.baseUrl + (value.indexOf("/") === 0 ? value : "/" + value)
    }

    text(element) {
        return element && element.text ? String(element.text).replace(/\s+/g, " ").trim() : ""
    }

    parseComics(doc) {
        let comics = []
        let seen = {}
        let coverLinks = doc.querySelectorAll("a.comic-cover")
        for (let coverLink of coverLinks) {
            let href = String(coverLink.attributes.href || "")
            let match = href.match(/comic_([0-9]+)\.html/i)
            if (!match || seen[match[1]]) continue
            let image = coverLink.querySelector("img")
            let title = image && image.attributes ? image.attributes.alt || "" : ""
            let titleLink = doc.querySelector('h3 a[href="' + href + '"]')
            if (titleLink) title = this.text(titleLink) || title
            if (!title && image && image.attributes) title = image.attributes.alt || ""
            if (!title) continue
            let cover = ""
            if (image && image.attributes) cover = image.attributes["data-original"] || image.attributes["data-src"] || image.attributes.src || ""
            seen[match[1]] = true
            comics.push(new Comic({
                id: "/comic_" + match[1] + ".html",
                title: title,
                cover: this.absoluteUrl(cover)
            }))
        }
        return comics
    }
}
