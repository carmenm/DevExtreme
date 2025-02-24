/* eslint-disable no-undef */
import $ from '../../core/renderer';
import Callbacks from '../../core/utils/callbacks';
import { each } from '../../core/utils/iterator';
import { executeAsync } from '../../core/utils/common';
import { extend } from '../../core/utils/extend';
const math = Math;
import { Scroller, SimulatedStrategy } from './ui.scrollable.simulated';
import LoadIndicator from '../load_indicator';

const SCROLLVIEW_PULLDOWN_REFRESHING_CLASS = 'dx-scrollview-pull-down-loading';
const SCROLLVIEW_PULLDOWN_READY_CLASS = 'dx-scrollview-pull-down-ready';
const SCROLLVIEW_PULLDOWN_VISIBLE_TEXT_CLASS = 'dx-scrollview-pull-down-text-visible';

const STATE_RELEASED = 0;
const STATE_READY = 1;
const STATE_REFRESHING = 2;
const STATE_LOADING = 3;


const ScrollViewScroller = Scroller.inherit({

    ctor: function() {
        this._topPocketSize = 0;
        this.callBase.apply(this, arguments);
        this._initCallbacks();
        this._releaseState();
    },

    _releaseState: function() {
        this._state = STATE_RELEASED;
        this._refreshPullDownText();
    },

    _refreshPullDownText: function() {
        const that = this;
        const pullDownTextItems = [{
            element: this._$pullingDownText,
            visibleState: STATE_RELEASED
        }, {
            element: this._$pulledDownText,
            visibleState: STATE_READY
        }, {
            element: this._$refreshingText,
            visibleState: STATE_REFRESHING
        }];

        each(pullDownTextItems, function(_, item) {
            const action = that._state === item.visibleState ? 'addClass' : 'removeClass';
            item.element[action](SCROLLVIEW_PULLDOWN_VISIBLE_TEXT_CLASS);
        });
    },

    _initCallbacks: function() {
        this.pullDownCallbacks = Callbacks();
        this.releaseCallbacks = Callbacks();
        this.reachBottomCallbacks = Callbacks();
    },

    _updateBounds: function() {
        const considerPockets = this._direction !== 'horizontal';

        this._topPocketSize = considerPockets ? Math.round(this._$topPocket[this._dimension]()) : 0;
        this._bottomPocketSize = considerPockets ? Math.round(this._$bottomPocket[this._dimension]()) : 0;

        this.callBase();
        this._bottomBound = this._minOffset + this._bottomPocketSize;
    },

    _updateScrollbar: function() {
        this._scrollbar.option({
            containerSize: this._containerSize(),
            contentSize: this._contentSize() - this._topPocketSize - this._bottomPocketSize,
            scaleRatio: this._getScaleRatio()
        });
    },

    _moveContent: function() {
        this.callBase();

        if(this._isPullDown()) {
            this._pullDownReady();
        } else if(this._isReachBottom()) {
            this._reachBottomReady();
        } else if(this._state !== STATE_RELEASED) {
            this._stateReleased();
        }
    },

    _moveScrollbar: function() {
        this._scrollbar.moveTo(this._topPocketSize + this._location);
    },

    _isPullDown: function() {
        return this._pullDownEnabled && this._location >= 0;
    },

    _isReachBottom: function() {
        return this._reachBottomEnabled && (this._location - this._bottomBound <= 0.5); // T858013
    },

    _scrollComplete: function() {
        if(this._inBounds() && this._state === STATE_READY) {
            this._pullDownRefreshing();
        } else if(this._inBounds() && this._state === STATE_LOADING) {
            this._reachBottomLoading();
        } else {
            this.callBase();
        }
    },

    _reachBottomReady: function() {
        if(this._state === STATE_LOADING) {
            return;
        }

        this._state = STATE_LOADING;
        this._minOffset = this._getMinOffset();
    },

    _getMaxOffset: function() {
        return -this._topPocketSize;
    },

    _getMinOffset: function() {
        return math.min(this.callBase(), -this._topPocketSize);
    },

    _reachBottomLoading: function() {
        this.reachBottomCallbacks.fire();
    },

    _pullDownReady: function() {
        if(this._state === STATE_READY) {
            return;
        }

        this._state = STATE_READY;
        this._maxOffset = 0;

        this._$pullDown.addClass(SCROLLVIEW_PULLDOWN_READY_CLASS);
        this._refreshPullDownText();
    },

    _stateReleased: function() {
        if(this._state === STATE_RELEASED) {
            return;
        }

        this._releaseState();
        this._updateBounds();

        this._$pullDown
            .removeClass(SCROLLVIEW_PULLDOWN_REFRESHING_CLASS)
            .removeClass(SCROLLVIEW_PULLDOWN_READY_CLASS);

        this.releaseCallbacks.fire();
    },

    _pullDownRefreshing: function() {
        if(this._state === STATE_REFRESHING) {
            return;
        }

        this._state = STATE_REFRESHING;

        this._$pullDown
            .addClass(SCROLLVIEW_PULLDOWN_REFRESHING_CLASS)
            .removeClass(SCROLLVIEW_PULLDOWN_READY_CLASS);
        this._refreshPullDownText();

        this.pullDownCallbacks.fire();
    },

    _releaseHandler: function() {
        if(this._state === STATE_RELEASED) {
            this._moveToBounds();
        }
        this._update();

        if(this._releaseTask) {
            this._releaseTask.abort();
        }

        this._releaseTask = executeAsync(this._release.bind(this));
        return this._releaseTask.promise;
    },

    _release: function() {
        this._stateReleased();
        this._scrollComplete();
    },

    _reachBottomEnablingHandler: function(enabled) {
        if(this._reachBottomEnabled === enabled) {
            return;
        }

        this._reachBottomEnabled = enabled;
        this._updateBounds();
    },

    _pullDownEnablingHandler: function(enabled) {
        if(this._pullDownEnabled === enabled) {
            return;
        }

        this._pullDownEnabled = enabled;
        this._considerTopPocketChange();
        this._updateHandler();
    },

    _considerTopPocketChange: function() {
        this._location -= this._$topPocket.height() || -this._topPocketSize;
        this._maxOffset = 0;
        this._move();
    },

    _pendingReleaseHandler: function() {
        this._state = STATE_READY;
    },

    dispose: function() {
        if(this._releaseTask) {
            this._releaseTask.abort();
        }
        this.callBase();
    }
});


const SimulatedScrollViewStrategy = SimulatedStrategy.inherit({

    _init: function(scrollView) {
        this.callBase(scrollView);
        this._$pullDown = scrollView._$pullDown;
        this._$topPocket = scrollView._$topPocket;
        this._$bottomPocket = scrollView._$bottomPocket;
        this._initCallbacks();
    },

    _initCallbacks: function() {
        this.pullDownCallbacks = Callbacks();
        this.releaseCallbacks = Callbacks();
        this.reachBottomCallbacks = Callbacks();
    },

    render: function() {
        this._renderPullDown();
        this.callBase();
    },

    _renderPullDown: function() {
        const $loadIndicator = new LoadIndicator($('<div>')).$element();

        this._$pullDown
            .empty()
            .append($image)
            .append($loadContainer.append($loadIndicator));
    },

    pullDownEnable: function(enabled) {
        this._eventHandler('pullDownEnabling', enabled);
    },

    reachBottomEnable: function(enabled) {
        this._eventHandler('reachBottomEnabling', enabled);
    },

    _createScroller: function(direction) {
        const that = this;
        const scroller = that._scrollers[direction] = new ScrollViewScroller(that._scrollerOptions(direction));
        scroller.pullDownCallbacks.add(function() { that.pullDownCallbacks.fire(); });
        scroller.releaseCallbacks.add(function() { that.releaseCallbacks.fire(); });
        scroller.reachBottomCallbacks.add(function() { that.reachBottomCallbacks.fire(); });
    },

    _scrollerOptions: function(direction) {
        return extend(this.callBase(direction), {
            $topPocket: this._$topPocket,
            $bottomPocket: this._$bottomPocket,
            $pullDown: this._$pullDown,
            $pullDownText: this._$pullDownText,
            $pullingDownText: this._$pullingDownText,
            $pulledDownText: this._$pulledDownText,
            $refreshingText: this._$refreshingText
        });
    },

    pendingRelease: function() {
        this._eventHandler('pendingRelease');
    },

    release: function() {
        return this._eventHandler('release').done(this._updateAction);
    },

    location: function() {
        const location = this.callBase();
        location.top += this._$topPocket.height();
        return location;
    },

    dispose: function() {
        each(this._scrollers, function() {
            this.dispose();
        });
        this.callBase();
    }
});

export default SimulatedScrollViewStrategy;
