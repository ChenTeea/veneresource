class Guazi extends ComicSource {
    name = "瓜子漫画"
    key = "guazi_manhua_v2"
    version = "1.0.1"
    minAppVersion = "1.2.2"
    url = "https://www.guazimanhua.com/"

    baseUrl = "https://www.guazimanhua.com"

    get headers() {
        return {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
            "referer": this.baseUrl + "/"
        }
    }

    search = {
        load: async (keyword, options, page) => {
            let url = this.baseUrl + "/category.php?keyword=" + encodeURIComponent(keyword)
            if (page > 1) url += "&page=" + page
            let res = await Network.get(url, this.headers)
            if (res.status !== 200) throw "搜索失败: " + res.status
            let comics = this.parseComics(new HtmlDocument(res.body))
            for (let comic of comics) {
                try {
                    let detail = await Network.get(this.baseUrl + comic.id, this.headers)
                    if (detail.status === 200) {
                        let doc = new HtmlDocument(detail.body)
                        let meta = doc.querySelector('meta[property="og:image"]')
                        if (meta && meta.attributes) comic.cover = meta.attributes.content || comic.cover
                    }
                } catch (error) {}
            }
            return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
        },
        optionList: [],
        enableTagsSuggestions: false
    }

    comic = {
        idMatch: "^(comic\\.php\\?id=[0-9]+|/comic\\.php\\?id=[0-9]+|https?://www\\.guazimanhua\\.com/comic\\.php\\?id=[0-9]+)$",
        link: {
            domains: ["www.guazimanhua.com", "guazimanhua.com"],
            linkToId: (url) => String(url).replace(/^https?:\/\/[^/]+/i, "")
        },
        onThumbnailLoad: (url) => ({ headers: this.headers }),
        onImageLoad: async (url, comicId, epId) => ({ headers: this.headers }),

        loadInfo: async (id) => {
            let url = this.normalizeComicUrl(id)
            let res = await Network.get(url, this.headers)
            if (res.status !== 200) throw "详情加载失败: " + res.status
            let doc = new HtmlDocument(res.body)
            let title = this.text(doc.querySelector("h1")) || this.text(doc.querySelector(".comic-title")) || "未知漫画"
            let cover = ""
            let meta = doc.querySelector('meta[property="og:image"]')
            if (meta && meta.attributes) cover = meta.attributes.content || ""
            if (!cover) {
                let image = doc.querySelector(".mobile-comic-cover") || doc.querySelector(".comic-cover img")
                if (image && image.attributes) cover = image.attributes.src || image.attributes["data-src"] || ""
            }
            let chapters = {}
            for (let link of doc.querySelectorAll('a[href*="chapter.php?id="]')) {
                let match = String(link.attributes.href || "").match(/chapter\.php\?id=([0-9]+)/i)
                if (match) chapters[match[1]] = this.text(link) || match[1]
            }
            if (Object.keys(chapters).length === 0) throw "没有找到章节"
            return new ComicDetails({ title: title, cover: cover, tags: {}, chapters: chapters, url: url })
        },

        loadEp: async (comicId, epId) => {
            let match = String(epId || "").match(/[0-9]+/)
            if (!match) throw "章节 ID 无效"
            let res = await Network.get(this.baseUrl + "/chapter.php?id=" + match[0], this.headers)
            if (res.status !== 200) throw "章节加载失败: " + res.status
            let doc = new HtmlDocument(res.body)
            let images = []
            let seen = {}
            let nodes = doc.querySelectorAll("img.reading-image")
            if (nodes.length === 0) nodes = doc.querySelectorAll("img")
            for (let image of nodes) {
                let attrs = image.attributes || {}
                let imageUrl = attrs.src || attrs["data-src"] || attrs["data-original"] || ""
                if (imageUrl && !seen[imageUrl]) {
                    seen[imageUrl] = true
                    images.push(imageUrl)
                }
            }
            if (images.length === 0) throw "没有找到章节图片"
            return { images: images }
        }
    }

    normalizeComicUrl(id) {
        let value = String(id || "")
        if (/^https?:\/\//i.test(value)) return value
        return this.baseUrl + (value.indexOf("/") === 0 ? value : "/" + value)
    }

    text(element) {
        return element && element.text ? String(element.text).replace(/\s+/g, " ").trim() : ""
    }

    parseComics(doc) {
        let comics = []
        let seen = {}
        let links = doc.querySelectorAll('a[href*="comic.php?id="]')
        for (let link of links) {
            let href = String(link.attributes.href || "")
            let match = href.match(/(?:^|\/)(comic\.php\?id=([0-9]+))/i)
            if (!match || seen[match[1]]) continue
            let image = link.querySelector("img")
            let title = ""
            if (link.attributes.title) title = link.attributes.title
            if (!title && image && image.attributes) title = image.attributes.alt || ""
            if (!title) title = this.text(link)
            if (!title) continue
            let cover = image && image.attributes ? image.attributes.src || image.attributes["data-src"] || "" : ""
            seen[match[1]] = true
            comics.push(new Comic({ id: "/" + match[1], title: title, cover: cover }))
        }
        return comics
    }
}
