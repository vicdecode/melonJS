import pool from "./../system/pooling.js";
import { viewport } from "./../game.js";
import Renderable from "./renderable.js";


/**
 * @classdesc
 * a generic Color Layer Object.  Fills the entire Canvas with the color not just the container the object belongs to.
 * @class ColorLayer
 * @extends me.Renderable
 * @memberOf me
 * @constructor
 * @param {String} name Layer name
 * @param {me.Color|String} color CSS color
 * @param {Number} [z = 0] z-index position
 */
class ColorLayer extends Renderable {

    /**
     * @ignore
     */
    constructor(name, color, z) {
        // parent constructor
        super(0, 0, Infinity, Infinity);

        /**
         * the layer color component
         * @public
         * @type me.Color
         * @name color
         * @memberOf me.ColorLayer#
         */
         this.color = pool.pull("Color").parseCSS(color);

         this.onResetEvent(name, color, z);

    }

    onResetEvent(name, color, z = 0) {
        // apply given parameters
        this.name = name;
        this.pos.z = z;
        this.floating = true;
        // string (#RGB, #ARGB, #RRGGBB, #AARRGGBB)
        this.color.parseCSS(color);
    }

    /**
     * draw the color layer
     * @ignore
     */
    draw(renderer, rect) {
        var color = renderer.getColor();
        var vpos = viewport.pos;
        renderer.setColor(this.color);
        renderer.fillRect(
            rect.left - vpos.x, rect.top - vpos.y,
            rect.width, rect.height
        );
        renderer.setColor(color);
    }

    /**
     * Destroy function
     * @ignore
     */
    destroy() {
        pool.push(this.color);
        this.color = undefined;
        super.destroy();
    }

};

export default ColorLayer;
