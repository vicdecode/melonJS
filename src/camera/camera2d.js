import Vector2d from "./../math/vector2.js";
import Vector3d from "./../math/vector3.js";
import ObservableVector2d from "./../math/observable_vector2.js";
import ObservableVector3d from "./../math/observable_vector3.js";
import Matrix2d from "./../math/matrix2.js";
import Matrix3d from "./../math/matrix3.js";
import Rect from "./../shapes/rectangle.js";
import { renderer } from "./../video/video.js";
import * as event from "./../system/event.js";
import pool from "./../system/pooling.js";
import Renderable from "./../renderable/renderable.js";
import {clamp, toBeCloseTo} from "./../math/math.js";
import { world } from "./../game.js";


// some ref shortcut
var MIN = Math.min, MAX = Math.max;

var targetV = new Vector2d();

/**
 * @classdesc
 * a 2D orthographic camera
 * @class Camera2d
 * @extends me.Renderable
 * @memberOf me
 * @constructor
 * @param {Number} minX start x offset
 * @param {Number} minY start y offset
 * @param {Number} maxX end x offset
 * @param {Number} maxY end y offset
 */
class Camera2d extends Renderable {

    /**
     * @ignore
     */
    constructor(minX, minY, maxX, maxY) {
        super(minX, minY, maxX - minX, maxY - minY);

        /**
         * Axis definition
         * @property NONE
         * @property HORIZONTAL
         * @property VERTICAL
         * @property BOTH
         * @public
         * @constant
         * @enum {Number}
         * @name AXIS
         * @memberOf me.Camera2d
         */
        this.AXIS = {
            NONE : 0,
            HORIZONTAL : 1,
            VERTICAL : 2,
            BOTH : 3
        };

        /**
         * Camera bounds
         * @public
         * @type me.Bounds
         * @name bounds
         * @memberOf me.Camera2d
         */
        this.bounds = pool.pull("Bounds");

        /**
         * [IMTERNAL] enable or disable damping
         * @private
         * @type {Boolean}
         * @name smoothFollow
         * @see me.Camera2d.damping
         * @default true
         * @memberOf me.Camera2d
         */
        this.smoothFollow = true;

        /**
         * Camera damping for smooth transition [0 .. 1].
         * 1 being the maximum value and will snap the camera to the target position
         * @public
         * @type {Number}
         * @name damping
         * @default 1.0
         * @memberOf me.Camera2d
         */
        this.damping = 1.0;

        /**
         * the closest point relative to the camera
         * @public
         * @type {Number}
         * @name near
         * @default -1000
         * @memberOf me.Camera2d
         */
        this.near = -1000;

        /**
         * the furthest point relative to the camera.
         * @public
         * @type {Number}
         * @name far
         * @default 1000
         * @memberOf me.Camera2d
         */
        this.far = 1000;

        /**
         * the default camera projection matrix
         * (2d cameras use an orthographic projection by default).
         * @public
         * @type {me.Matrix3d}
         * @name projectionMatrix
         * @memberOf me.Camera2d
         */
        this.projectionMatrix = new Matrix3d();

        /**
         * the invert camera transform used to unproject points
         * @ignore
         * @type {me.Matrix2d}
         * @name invCurrentTransform
         * @memberOf me.Camera2d
         */
        this.invCurrentTransform = new Matrix2d();

        // offset for shake effect
        this.offset = new Vector2d();

        // target to follow
        this.target = null;

        // default value follow
        this.follow_axis = this.AXIS.NONE;

        // shake variables
        this._shake = {
            intensity : 0,
            duration : 0,
            axis : this.AXIS.BOTH,
            onComplete : null
        };

        // flash variables
        this._fadeOut = {
            color : null,
            tween : null
        };
        // fade variables
        this._fadeIn = {
            color : null,
            tween : null
        };

        // default camera name
        this.name = "default";

        // set a default deadzone
        this.setDeadzone(this.width / 6, this.height / 6);

        // for backward "compatiblity" (in terms of behavior)
        this.anchorPoint.set(0, 0);

        // enable event detection on the camera
        this.isKinematic = false;

        this.bounds.setMinMax(minX, minY, maxX, maxY);

        // update the projection matrix
        this._updateProjectionMatrix();

        // subscribe to the game reset event
        event.on(event.GAME_RESET, this.reset, this);
        // subscribe to the canvas resize event
        event.on(event.CANVAS_ONRESIZE, this.resize, this);
    }

    // -- some private function ---

    /** @ignore */
    // update the projection matrix based on the projection frame (a rectangle)
    _updateProjectionMatrix() {
        this.projectionMatrix.ortho(0, this.width, this.height, 0, this.near, this.far);
    }

    /** @ignore */
    _followH(target) {
        var targetX = this.pos.x;
        if ((target.x - this.pos.x) > (this.deadzone.right)) {
            targetX = MIN((target.x) - (this.deadzone.right), this.bounds.width - this.width);
        }
        else if ((target.x - this.pos.x) < (this.deadzone.pos.x)) {
            targetX = MAX((target.x) - this.deadzone.pos.x, this.bounds.left);
        }
        return targetX;

    }

    /** @ignore */
    _followV(target) {
        var targetY = this.pos.y;
        if ((target.y - this.pos.y) > (this.deadzone.bottom)) {
            targetY = MIN((target.y) - (this.deadzone.bottom), this.bounds.height - this.height);
        }
        else if ((target.y - this.pos.y) < (this.deadzone.pos.y)) {
            targetY = MAX((target.y) - this.deadzone.pos.y, this.bounds.top);
        }
        return targetY;
    }

    // -- public function ---

    /**
     * reset the camera position to specified coordinates
     * @name reset
     * @memberOf me.Camera2d
     * @function
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     */
    reset(x = 0, y = 0) {
        // reset the initial camera position to 0,0
        this.pos.x = x;
        this.pos.y = y;

        // reset the target
        this.unfollow();

        // damping default value
        this.smoothFollow = true;
        this.damping = 1.0;

        // reset the transformation matrix
        this.currentTransform.identity();
        this.invCurrentTransform.identity().invert();

        // update the projection matrix
        this._updateProjectionMatrix();
    }

    /**
     * change the deadzone settings.
     * the "deadzone" defines an area within the current camera in which
     * the followed renderable can move without scrolling the camera.
     * @name setDeadzone
     * @see me.Camera2d.follow
     * @memberOf me.Camera2d
     * @function
     * @param {Number} w deadzone width
     * @param {Number} h deadzone height
     */
    setDeadzone(w, h) {
        if (typeof(this.deadzone) === "undefined") {
            this.deadzone = new Rect(0, 0, 0, 0);
        }

        // reusing the old code for now...
        this.deadzone.pos.set(
            ~~((this.width - w) / 2),
            ~~((this.height - h) / 2 - h * 0.25)
        );
        this.deadzone.resize(w, h);

        this.smoothFollow = false;

        // force a camera update
        this.updateTarget();

        this.smoothFollow = true;
    }

    /**
     * resize the camera
     * @name resize
     * @memberOf me.Camera2d
     * @function
     * @param {Number} w new width of the camera
     * @param {Number} h new height of the camera
     * @return {me.Camera2d} this camera
    */
    resize(w, h) {
        // parent consctructor, resize camera rect
        super.resize(w, h);

        // disable damping while resizing
        this.smoothFollow = false;

        // reset everything
        this.setBounds(0, 0, w, h);
        this.setDeadzone(w / 6, h / 6);
        this.update();
        this.smoothFollow = true;

        // update the projection matrix
        this._updateProjectionMatrix();

        // publish the viewport resize event
        event.emit(event.VIEWPORT_ONRESIZE, this.width, this.height);

        return this;
    }

    /**
     * set the camera boundaries (set to the world limit by default).
     * the camera is bound to the given coordinates and cannot move/be scrolled outside of it.
     * @name setBounds
     * @memberOf me.Camera2d
     * @function
     * @param {Number} x world left limit
     * @param {Number} y world top limit
     * @param {Number} w world width limit
     * @param {Number} h world height limit
     */
    setBounds(x, y, w, h) {
        this.smoothFollow = false;
        this.bounds.setMinMax(x, y, w + x, h + y);
        this.moveTo(this.pos.x, this.pos.y);
        this.update();
        this.smoothFollow = true;
    }

    /**
     * set the camera to follow the specified renderable. <br>
     * (this will put the camera center around the given target)
     * @name follow
     * @memberOf me.Camera2d
     * @function
     * @param {me.Renderable|me.Vector2d} target renderable or position vector to follow
     * @param {me.Camera2d.AXIS} [axis=this.AXIS.BOTH] Which axis to follow
     * @param {Number} [damping=1] default damping value
     * @example
     * // set the camera to follow this renderable on both axis, and enable damping
     * me.game.viewport.follow(this, me.game.viewport.AXIS.BOTH, 0.1);
     */
    follow(target, axis, damping) {
        if (target instanceof Renderable) {
            this.target = target.pos;
        }
        else if ((target instanceof Vector2d) || (target instanceof Vector3d) ||
                 (target instanceof ObservableVector2d) || (target instanceof ObservableVector3d)) {
            this.target = target;
        }
        else {
            throw new Error("invalid target for me.Camera2d.follow");
        }
        // if axis is null, camera is moved on target center
        this.follow_axis = (
            typeof(axis) === "undefined" ? this.AXIS.BOTH : axis
        );

        this.smoothFollow = false;

        if (typeof damping !== "number") {
            this.damping = 1;
        } else {
            this.damping = clamp(damping, 0.0, 1.0);
        }

        // force a camera update
        this.updateTarget();

        this.smoothFollow = true;
    }

    /**
     * unfollow the current target
     * @name unfollow
     * @memberOf me.Camera2d
     * @function
     */
    unfollow() {
        this.target = null;
        this.follow_axis = this.AXIS.NONE;
    }

    /**
     * move the camera upper-left position by the specified offset.
     * @name move
     * @memberOf me.Camera2d
     * @see me.Camera2d.focusOn
     * @function
     * @param {Number} x
     * @param {Number} y
     * @example
     * // Move the camera up by four pixels
     * me.game.viewport.move(0, -4);
     */
    move(x, y) {
        this.moveTo(this.pos.x + x, this.pos.y + y);
    }

    /**
     * move the camera upper-left position to the specified coordinates
     * @name moveTo
     * @memberOf me.Camera2d
     * @see me.Camera2d.focusOn
     * @function
     * @param {Number} x
     * @param {Number} y
     */
    moveTo(x, y) {
        var _x = this.pos.x;
        var _y = this.pos.y;

        this.pos.x = clamp(
            x,
            this.bounds.left,
            this.bounds.width
        );
        this.pos.y = clamp(
            y,
            this.bounds.top,
            this.bounds.height
        );

        //publish the VIEWPORT_ONCHANGE event if necessary
        if (_x !== this.pos.x || _y !== this.pos.y) {
            event.emit(event.VIEWPORT_ONCHANGE, this.pos);
        }
    }

    /** @ignore */
    updateTarget() {
        if (this.target) {

            targetV.setV(this.pos);

            switch (this.follow_axis) {
                case this.AXIS.NONE:
                    //this.focusOn(this.target);
                    break;

                case this.AXIS.HORIZONTAL:
                    targetV.x = this._followH(this.target);
                    break;

                case this.AXIS.VERTICAL:
                    targetV.y = this._followV(this.target);
                    break;

                case this.AXIS.BOTH:
                    targetV.x = this._followH(this.target);
                    targetV.y = this._followV(this.target);
                    break;

                default:
                    break;
            }

            if (!this.pos.equals(targetV)) {
                // update the camera position
                if (this.smoothFollow === true && this.damping < 1.0) {
                    // account for floating precision and check if we are close "enough"
                    if (toBeCloseTo(targetV.x, this.pos.x, 2) &&
                        toBeCloseTo(targetV.y, this.pos.y, 2)) {
                        this.pos.setV(targetV);
                        return false;
                    } else {
                        this.pos.lerp(targetV, this.damping);
                    }
                } else {
                    this.pos.setV(targetV);
                }
                return true;
            }
        }
        return false;
    }

    /** @ignore */
    update(dt) {
        var updated = this.updateTarget(dt);

        if (this._shake.duration > 0) {
            this._shake.duration -= dt;
            if (this._shake.duration <= 0) {
                this._shake.duration = 0;
                this.offset.setZero();
                if (typeof(this._shake.onComplete) === "function") {
                    this._shake.onComplete();
                }
            }
            else {
                if (this._shake.axis === this.AXIS.BOTH ||
                    this._shake.axis === this.AXIS.HORIZONTAL) {
                    this.offset.x = (Math.random() - 0.5) * this._shake.intensity;
                }
                if (this._shake.axis === this.AXIS.BOTH ||
                    this._shake.axis === this.AXIS.VERTICAL) {
                    this.offset.y = (Math.random() - 0.5) * this._shake.intensity;
                }
            }
            // updated!
            updated = true;
        }

        if (updated === true) {
            //publish the corresponding message
            event.emit(event.VIEWPORT_ONCHANGE, this.pos);
        }

        // check for fade/flash effect
        if ((this._fadeIn.tween != null) || (this._fadeOut.tween != null)) {
            updated = true;
        }

        if (!this.currentTransform.isIdentity()) {
            this.invCurrentTransform.copy(this.currentTransform).invert();
        } else {
            // reset to default
            this.invCurrentTransform.identity();
        }
        return updated;
    }

    /**
     * shake the camera
     * @name shake
     * @memberOf me.Camera2d
     * @function
     * @param {Number} intensity maximum offset that the screen can be moved
     * while shaking
     * @param {Number} duration expressed in milliseconds
     * @param {me.Camera2d.AXIS} [axis=this.AXIS.BOTH] specify on which axis you
     *   want the shake effect
     * @param {Function} [onComplete] callback once shaking effect is over
     * @param {Boolean} [force] if true this will override the current effect
     * @example
     * // shake it baby !
     * me.game.viewport.shake(10, 500, me.game.viewport.AXIS.BOTH);
     */
    shake(intensity, duration, axis, onComplete, force) {
        if (this._shake.duration === 0 || force === true) {
            this._shake.intensity = intensity;
            this._shake.duration = duration;
            this._shake.axis = axis || this.AXIS.BOTH;
            this._shake.onComplete = typeof (onComplete) === "function" ? onComplete : undefined;
        }
    }

    /**
     * fadeOut(flash) effect<p>
     * screen is filled with the specified color and slowly goes back to normal
     * @name fadeOut
     * @memberOf me.Camera2d
     * @function
     * @param {me.Color|String} color a CSS color value
     * @param {Number} [duration=1000] expressed in milliseconds
     * @param {Function} [onComplete] callback once effect is over
     * @example
     * // fade the camera to white upon dying, reload the level, and then fade out back
     * me.game.viewport.fadeIn("#fff", 150, function() {
     *     me.audio.play("die", false);
     *     me.level.reload();
     *     me.game.viewport.fadeOut("#fff", 150);
     * });
     */
    fadeOut(color, duration = 1000, onComplete) {
        this._fadeOut.color = pool.pull("Color").copy(color);
        this._fadeOut.tween = pool.pull("Tween", this._fadeOut.color)
            .to({ alpha: 0.0 }, duration)
            .onComplete(onComplete || null);
        this._fadeOut.tween.isPersistent = true;
        this._fadeOut.tween.start();
    }

    /**
     * fadeIn effect <p>
     * fade to the specified color
     * @name fadeIn
     * @memberOf me.Camera2d
     * @function
     * @param {me.Color|String} color a CSS color value
     * @param {Number} [duration=1000] expressed in milliseconds
     * @param {Function} [onComplete] callback once effect is over
     * @example
     * // flash the camera to white for 75ms
     * me.game.viewport.fadeIn("#FFFFFF", 75);
     */
    fadeIn(color, duration = 1000, onComplete) {
        this._fadeIn.color = pool.pull("Color").copy(color);
        var _alpha = this._fadeIn.color.alpha;
        this._fadeIn.color.alpha = 0.0;
        this._fadeIn.tween = pool.pull("Tween", this._fadeIn.color)
            .to({ alpha: _alpha }, duration)
            .onComplete(onComplete || null);
        this._fadeIn.tween.isPersistent = true;
        this._fadeIn.tween.start();
    }

    /**
     * return the camera width
     * @name getWidth
     * @memberOf me.Camera2d
     * @function
     * @return {Number}
     */
    getWidth() {
        return this.width;
    }

    /**
     * return the camera height
     * @name getHeight
     * @memberOf me.Camera2d
     * @function
     * @return {Number}
     */
    getHeight() {
        return this.height;
    }

    /**
     * set the camera position around the specified object
     * @name focusOn
     * @memberOf me.Camera2d
     * @function
     * @param {me.Renderable}
     */
    focusOn(target) {
        var bounds = target.getBounds();
        this.moveTo(
            target.pos.x + bounds.left + (bounds.width / 2),
            target.pos.y + bounds.top + (bounds.height / 2)
        );
    }

    /**
     * check if the specified renderable is in the camera
     * @name isVisible
     * @memberOf me.Camera2d
     * @function
     * @param {me.Renderable} object
     * @param {Boolean} [floating===object.floating] if visibility check should be done against screen coordinates
     * @return {Boolean}
     */
    isVisible(obj, floating = obj.floating) {
        if (floating === true || obj.floating === true) {
            // check against screen coordinates
            return renderer.overlaps(obj.getBounds());
        } else {
            // check if within the current camera
            return obj.getBounds().overlaps(this);
        }
    }

    /**
     * convert the given "local" (screen) coordinates into world coordinates
     * @name localToWorld
     * @memberOf me.Camera2d
     * @function
     * @param {Number} x
     * @param {Number} y
     * @param {Number} [v] an optional vector object where to set the
     * converted value
     * @return {me.Vector2d}
     */
    localToWorld(x, y, v) {
        // TODO memoization for one set of coords (multitouch)
        v = v || new Vector2d();
        v.set(x, y).add(this.pos).sub(world.pos);
        if (!this.currentTransform.isIdentity()) {
            this.invCurrentTransform.apply(v);
        }
        return v;
    }

    /**
     * convert the given world coordinates into "local" (screen) coordinates
     * @name worldToLocal
     * @memberOf me.Camera2d
     * @function
     * @param {Number} x
     * @param {Number} y
     * @param {Number} [v] an optional vector object where to set the
     * converted value
     * @return {me.Vector2d}
     */
    worldToLocal(x, y, v) {
        // TODO memoization for one set of coords (multitouch)
        v = v || new Vector2d();
        v.set(x, y);
        if (!this.currentTransform.isIdentity()) {
            this.currentTransform.apply(v);
        }
        return v.sub(this.pos).add(world.pos);
    }

    /**
     * render the camera effects
     * @ignore
     */
    drawFX(renderer) {
        // fading effect
        if (this._fadeIn.tween) {
            // add an overlay
            renderer.save();
            // reset all transform so that the overaly cover the whole camera area
            renderer.resetTransform();
            renderer.setColor(this._fadeIn.color);
            renderer.fillRect(0, 0, this.width, this.height);
            renderer.restore();
            // remove the tween if over
            if (this._fadeIn.color.alpha === 1.0) {
                this._fadeIn.tween = null;
                pool.push(this._fadeIn.color);
                this._fadeIn.color = null;
            }
        }

        // flashing effect
        if (this._fadeOut.tween) {
            // add an overlay
            renderer.save();
            // reset all transform so that the overaly cover the whole camera area
            renderer.resetTransform();
            renderer.setColor(this._fadeOut.color);
            renderer.fillRect(0, 0, this.width, this.height);
            renderer.restore();
            // remove the tween if over
            if (this._fadeOut.color.alpha === 0.0) {
                this._fadeOut.tween = null;
                pool.push(this._fadeOut.color);
                this._fadeOut.color = null;
            }
        }
    }

    /**
     * draw all object visibile in this viewport
     * @ignore
     */
    draw(renderer, container) {
        var translateX = this.pos.x + this.offset.x;
        var translateY = this.pos.y + this.offset.y;

        // translate the world coordinates by default to screen coordinates
        container.currentTransform.translate(-translateX, -translateY);

        // set the camera projection
        renderer.setProjection(this.projectionMatrix);

        // clip to camera bounds
        renderer.clipRect(
            0,
            0,
            this.width,
            this.height
        );

        this.preDraw(renderer);

        container.preDraw(renderer);

        // draw all objects,
        // specifying the viewport as the rectangle area to redraw
        container.draw(renderer, this);

        // draw the viewport/camera effects
        this.drawFX(renderer);

        container.postDraw(renderer);

        this.postDraw(renderer);

        // translate the world coordinates by default to screen coordinates
        container.currentTransform.translate(translateX, translateY);
    }

};

export default Camera2d;
