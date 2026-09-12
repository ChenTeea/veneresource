class HaoKan extends ComicSource {
    name = "好看漫画"
    key = "haokan_txt"
    version = "1.0.0"
    minAppVersion = "1.2.2"
    url = "https://www.haokantxt.com/"

    baseUrl = "https://www.haokantxt.com"

    get headers() {
        return {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
            "referer": this.baseUrl + "/"
        }
    }

    search = {
        load: async (keyword, options, page) => {
            let url = this.baseUrl + "/search?key=" + encodeURIComponent(keyword)
            if (page > 1) url += "&page=" + page
            let res = await Network.get(url, this.headers)
            if (res.status !== 200) throw "搜索失败: " + res.status

            let doc = new HtmlDocument(res.body)
            let comics = this.parseSearchResults(doc)

            for (let comic of comics) {
                try {
                    let detail = await Network.get(this.baseUrl + comic.id, this.headers)
                    if (detail.status === 200) {
                        let detailDoc = new HtmlDocument(detail.body)
                        let image = detailDoc.querySelector('meta[property="og:image"]')
                        if (image && image.attributes && image.attributes.content) {
                            comic.cover = image.attributes.content
                        }
                    }
                } catch (error) {
                    // 保留搜索页封面作为回退
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

    comic = {
        idMatch: "^(/comic_[^?#]+\\.html|https?://www\\.haokantxt\\.com/comic_[^?#]+\\.html)$",
        link: {
            domains: ["www.haokantxt.com"],
            linkToId: (url) => url.replace(/^https?:\/\/www\.haokantxt\.com/i, "")
        },

        onThumbnailLoad: (url) => ({
            headers: this.headers
        }),

        onImageLoad: async (url, comicId, epId) => ({
            headers: {
                "user-agent": this.headers["user-agent"],
                "referer": this.baseUrl + "/"
            }
        }),

        loadInfo: async (id) => {
            let url = this.normalizeComicUrl(id)
            let res = await Network.get(url, this.headers)
            if (res.status !== 200) throw "详情加载失败: " + res.status

            let doc = new HtmlDocument(res.body)
            let title = this.text(doc.querySelector("h1"))
            if (!title) title = this.text(doc.querySelector(".comic-title"))
            if (!title) title = "未知漫画"

            let cover = ""
            let image = doc.querySelector('meta[property="og:image"]')
            if (image && image.attributes) cover = image.attributes.content || ""
            if (!cover) {
                let coverImage = doc.querySelector(".comic-cover-large img") || doc.querySelector(".comic-cover img")
                if (coverImage && coverImage.attributes) cover = coverImage.attributes.src || coverImage.attributes["data-src"] || ""
            }

            let chapters = {}
            let links = doc.querySelectorAll("a")
            for (let link of links) {
                let href = String(link.attributes.href || "")
                let match = href.match(/chapter_([0-9]+)_([0-9]+)\.html/i)
                if (match) {
                    chapters[match[1] + "@" + match[2]] = this.text(link) || match[2]
                }
            }
            if (Object.keys(chapters).length === 0) throw "没有找到章节"

            return new ComicDetails({
                title: title,
                cover: this.absoluteUrl(cover),
                tags: {},
                chapters: chapters,
                url: url
            })
        },

        loadEp: async (comicId, epId) => {
            let parts = String(epId || "").split("@")
            if (parts.length !== 2) throw "章节 ID 无效"

            let url = this.baseUrl + "/chapter_" + parts[0] + "_" + parts[1] + ".html"
            let res = await Network.get(url, this.headers)
            if (res.status !== 200) throw "章节加载失败: " + res.status

            let doc = new HtmlDocument(res.body)
            let images = []
            let seen = {}
            let nodes = doc.querySelectorAll("img.comic-image")
            if (nodes.length === 0) nodes = doc.querySelectorAll("img")

            for (let image of nodes) {
                let attrs = image.attributes || {}
                let imageUrl = attrs["data-src"] || attrs.src || attrs["data-original"] || ""
                imageUrl = this.absoluteUrl(imageUrl)
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

    parseSearchResults(doc) {
        let comics = []
        let seen = {}
        let links = doc.querySelectorAll("a.comic-cover")

        for (let link of links) {
            let href = String(link.attributes.href || "")
            let match = href.match(/\/comic_[^?#]+\.html/i)
            if (!match || seen[match[0]]) continue

            let image = link.querySelector("img")
            let title = ""
            let titleLink = doc.querySelector('h3 a[href="' + href + '"]')
            if (titleLink) title = this.text(titleLink)
            if (!title && image && image.attributes) title = image.attributes.alt || ""
            if (!title) continue

            let cover = ""
            if (image && image.attributes) {
                cover = image.attributes["data-src"] || image.attributes.src || ""
            }

            seen[match[0]] = true
            comics.push(new Comic({
                id: match[0],
                title: title,
                cover: this.absoluteUrl(cover)
            }))
        }
        return comics
    }
}
