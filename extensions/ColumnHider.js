define(["dojo/_base/declare", "dojo/has", "dojo/on", "../util/misc", "put-selector/put", "dojo/i18n!./nls/columnHider", "dojo/dom-attr", "xstyle/css!../css/extensions/ColumnHider.css"],
function(declare, has, listen, miscUtil, put, i18n, domAttr){
/*
 *	Column Hider plugin for dgrid
 *	Originally contributed by TRT 2011-09-28
 *
 *	A dGrid plugin that attaches a menu to a dgrid, along with a way of opening it,
 *	that will allow you to show and hide columns.  A few caveats:
 *
 *	1. Menu placement is entirely based on CSS definitions.
 *	2. If you want columns initially hidden, you must add "hidden: true" to your
 *		column definition.
 *	3. This implementation does NOT support ColumnSet, and has not been tested
 *		with multi-subrow records.
 *	4. Column show/hide is controlled via straight up HTML checkboxes.  If you
 *		are looking for something more fancy, you'll probably need to use this
 *		definition as a template to write your own plugin.
 *
 */
	
	var activeGrid, // references grid for which the menu is currently open
		//bodyListener, // references pausable event handler for body mousedown  //MR commented out, not used, see usage this._bodyListener
		// Need to handle old IE specially for checkbox listener and for attribute.
		hasIE = has("ie"),
		hasIEQuirks = hasIE && has("quirks"),
		forAttr = hasIE < 8 || hasIEQuirks ? "htmlFor" : "for";
	
	function getColumnIdFromCheckbox(cb, grid){
		// Given one of the checkboxes from the hider menu,
		// return the id of the corresponding column.
		// (e.g. gridIDhere-hider-menu-check-colIDhere -> colIDhere)

		//return cb.id.substr(grid.id.length + 18);
		//[GTI]MR: added to support nested properties
		return domAttr.get(cb.id, "data-field");
	}
	
	return declare(null, {
		// hiderMenuNode: DOMNode
		//		The node for the menu to show/hide columns.
		hiderMenuNode: null,
		
		// hiderToggleNode: DOMNode
		//		The node for the toggler to open the menu.
		hiderToggleNode: null,
		
		// i18nColumnHider: Object
		//		This object contains all of the internationalized strings for
		//		the ColumnHider extension as key/value pairs.
		i18nColumnHider: i18n,
		
		// _hiderMenuOpened: Boolean
		//		Records the current open/closed state of the menu.
		_hiderMenuOpened: false,
		
		// _columnHiderRules: Object
		//		Hash containing handles returned from addCssRule.
		_columnHiderRules: null,
		
		// _columnHiderCheckboxes: Object
		//		Hash containing checkboxes generated for menu items.
		_columnHiderCheckboxes: null,
		
		// dataColumnSetIndex: Number
		//		Index of columnset to use when generating checkboxes
		dataColumnSetIndex: 0,//[GTI]:AR,PM: added new prop
		
		_renderHiderMenuEntries: function(){
			// summary:
			//		Iterates over subRows for the sake of adding items to the
			//		column hider menu.
			
			//[GTI]PK: to support column hider also with columnSets (select a columnset to apply column hider on)
			var subRows = this.columnSets ? this.columnSets[this.dataColumnSetIndex || 0] : this.subRows,
				first = true,
				srLength, cLength, sr, c;
			
			delete this._columnHiderFirstCheckbox;
			
			for(sr = 0, srLength = subRows.length; sr < srLength; sr++){
				for(c = 0, cLength = subRows[sr].length; c < cLength; c++){
					this._renderHiderMenuEntry(subRows[sr][c]);
					if(first){
						first = false;
						this._columnHiderFirstCheckbox =
							this._columnHiderCheckboxes[subRows[sr][c].id];
					}
				}
			}
		},
		
		_renderHiderMenuEntry: function(col){
			var id = col.id,
				replacedId = miscUtil.escapeCssIdentifier(id, "-"),
				div,
				checkId,
				checkbox,
				label;
			
			if(col.hidden){
				// Hide the column (reset first to avoid short-circuiting logic)
				col.hidden = false;
				this._hideColumn(id);
				col.hidden = true;
			}
			
			// Allow cols to opt out of the hider (e.g. for selector column).
			if(col.unhidable){ return; }
			
			// Create the checkbox and label for each column selector.
			div = put("div.dgrid-hider-menu-row");
			checkId = this.domNode.id + "-hider-menu-check-" + replacedId;
			
			// put-selector can't handle invalid selector characters, and the
			// ID could have some, so add it directly
			checkbox = this._columnHiderCheckboxes[id] =
				put(div, "input.dgrid-hider-menu-check.hider-menu-check-" + replacedId + "[type=checkbox][data-field=" + id + "]"); //[GTI]MR: added data-field attribute for nested properties support
			checkbox.id = checkId;
			
			label = put(div, "label.dgrid-hider-menu-label.hider-menu-label-" + replacedId +
				"[" + forAttr + "=" + checkId + "]",
				col.columnHiderLabel || col.label || col.field || "");
			
			put(this.hiderMenuNode, div);
			
			if(!col.hidden){
				// Hidden state is false; checkbox should be initially checked.
				// (Need to do this after adding to DOM to avoid IE6 clobbering it.)
				checkbox.checked = true;
			}
		},
		
		renderHeader: function(){
			var grid = this,
				hiderMenuNode = this.hiderMenuNode,
				hiderToggleNode = this.hiderToggleNode,
				id,
				bodyListener = this._bodyListener; //[GTI]MR: added to support user preferrences, references pausable event handler for body mousedown
			
			function stopPropagation(event){
				event.stopPropagation();
			}
			
			this.inherited(arguments);
			
			if(!hiderMenuNode){ // first run
				// Assume that if this plugin is used, then columns are hidable.
				// Create the toggle node.
				hiderToggleNode = this.hiderToggleNode =
					put(this.domNode, "button.ui-icon.dgrid-hider-toggle[type=button][aria-label=" +
						this.i18nColumnHider.popupTriggerLabel + "]");
				
				this._listeners.push(listen(hiderToggleNode, "click", function(e){
					grid._toggleColumnHiderMenu(e);
				}));
	
				// Create the column list, with checkboxes.
				hiderMenuNode = this.hiderMenuNode =
					put("div.dgrid-hider-menu[role=dialog][aria-label=" +
						this.i18nColumnHider.popupLabel + "]");
				hiderMenuNode.id = this.id + "-hider-menu";

				this._listeners.push(listen(hiderMenuNode, "keyup", function (e) {
					var charOrCode = e.charCode || e.keyCode;
					if(charOrCode === /*ESCAPE*/ 27){
						grid._toggleColumnHiderMenu(e);
						hiderToggleNode.focus();
					}
				}));
				
				// Make sure our menu is initially hidden, then attach to the document.
				hiderMenuNode.style.display = "none";
				put(this.domNode, hiderMenuNode);
				
				// Hook up delegated listener for modifications to checkboxes.
				this._listeners.push(listen(hiderMenuNode,
						".dgrid-hider-menu-check:" + (hasIE < 9 || hasIEQuirks ? "click" : "change"),
					function(e){
						grid._updateColumnHiddenState(
							getColumnIdFromCheckbox(e.target, grid), !e.target.checked);
					}
				));
				
				// Stop click events from propagating from menu or trigger nodes,
				// so that we can simply track body clicks for hide without
				// having to drill-up to check.
				this._listeners.push(
					listen(hiderMenuNode, "mousedown", stopPropagation),
					listen(hiderToggleNode, "mousedown", stopPropagation)
				);
				
				// Hook up top-level mousedown listener if it hasn't been yet.
				if(!bodyListener){
					//[GTI]MR: added this._bodyListener to support user preferrences
					this._listeners.push(bodyListener = this._bodyListener = listen.pausable(document, "mousedown", function(e){
						// If an event reaches this listener, the menu is open,
						// but a click occurred outside, so close the dropdown.

						//[GTI]MR: we can relly on _hiderMenuOpened because this variable decides about previously used activeGrid
						//we can not relly on activeGrid anymore, because it is local variable and we might need to handle this in UserPreferrences extension too.
						if (grid._hiderMenuOpened) {
							grid._toggleColumnHiderMenu(e);
						}

						//activeGrid && activeGrid._toggleColumnHiderMenu(e);
					}));

					bodyListener.pause(); // pause initially; will resume when menu opens
				}
			}else{ // subsequent run
				// Remove active rules, and clear out the menu (to be repopulated).
				for(id in this._columnHiderRules){
					this._columnHiderRules[id].remove();
				}
				hiderMenuNode.innerHTML = "";
			}
			
			this._columnHiderCheckboxes = {};
			this._columnHiderRules = {};

			// Populate menu with checkboxes/labels based on current columns.
			this._renderHiderMenuEntries();
		},
		
		destroy: function(){
			this.inherited(arguments);
			// Remove any remaining rules applied to hidden columns.
			for(var id in this._columnHiderRules){
				this._columnHiderRules[id].remove();
			}
		},
		
		left: function(cell, steps){
			return this.right(cell, -steps);
		},
		
		right: function(cell, steps){
			if(!cell.element){
				cell = this.cell(cell);
			}
			var nextCell = this.inherited(arguments),
				prevCell = cell;
			
			// Skip over hidden cells
			while(nextCell.column.hidden){
				nextCell = this.inherited(arguments, [nextCell, steps > 0 ? 1 : -1]);
				if(prevCell.element === nextCell.element){
					// No further visible cell found - return original
					return cell;
				}
				prevCell = nextCell;
			}
			return nextCell;
		},
		
		isColumnHidden: function(id){
			// summary:
			//		Convenience method to determine current hidden state of a column
			return !!this._columnHiderRules[id];
		},
		
		resizeColumnHiderMenu : function() {
			// summary:
			//		Used to resize opened column hider menu after possible change of grid height caused by hiding columns
			//		Hiding/showing columns may change grid height when:
			//		 - horizontal scrollbar appears/disappears
			//		 - header height changes because of presence/absence of mutliline texts
			//		by [GTI]
			var hiderMenuNode = this.hiderMenuNode,
				domNode = this.domNode,
				scrollTop = hiderMenuNode.scrollTop;
			
			hiderMenuNode.style.height = ""; // reset height			
			if (this._hiderMenuOpened && hiderMenuNode.offsetHeight > this.domNode.offsetHeight - 12) {
				// see _toggleColumnHiderMenu for explanation of 12
				hiderMenuNode.style.height = (domNode.offsetHeight - 12) + "px";
				hiderMenuNode.scrollTop = scrollTop; // restore scroll position after height reset
			}
		},
		
		_toggleColumnHiderMenu: function(){
			var hidden = this._hiderMenuOpened, // reflects hidden state after toggle
				hiderMenuNode = this.hiderMenuNode,
				domNode = this.domNode,
				bodyListener = this._bodyListener, //[GTI]MR: added to support user preferrences, references pausable event handler for body mousedown
				firstCheckbox;

			// Show or hide the hider menu
			hiderMenuNode.style.display = (hidden ? "none" : "");

			// Adjust height of menu
			if (hidden) {
				// Clear the set size
				hiderMenuNode.style.height = "";
			} else {
				// Adjust height of the menu if necessary
				// Why 12? Based on menu default paddings and border, we need
				// to adjust to be 12 pixels shorter. Given the infrequency of
				// this style changing, we're assuming it will remain this
				// static value of 12 for now, to avoid pulling in any sort of
				// computed styles.
				if (hiderMenuNode.offsetHeight > domNode.offsetHeight - 12) {
					hiderMenuNode.style.height = (domNode.offsetHeight - 12) + "px";
				}
				// focus on the first checkbox
				(firstCheckbox = this._columnHiderFirstCheckbox) && firstCheckbox.focus();
			}

			// Pause or resume the listener for clicks outside the menu
			bodyListener[hidden ? "pause" : "resume"]();

			//[GTI]MR: activeGrid not needed anymore, causes problems with User preferrences extension
			// Update activeGrid appropriately
			//activeGrid = hidden ? null : this;

			// Toggle the instance property
			this._hiderMenuOpened = !hidden;
		},
		
		_hideColumn: function(id){
			// summary:
			//		Hides the column indicated by the given id.
			
			// Use miscUtil function directly, since we clean these up ourselves anyway
			var grid = this,
				selectorPrefix = "#" + miscUtil.escapeCssIdentifier(this.domNode.id) + " .dgrid-column-",
				tableRule; // used in IE8 code path

			if (this._columnHiderRules[id]) {
				return;
			}

			this._columnHiderRules[id] =
				miscUtil.addCssRule(selectorPrefix + miscUtil.escapeCssIdentifier(id, "-"),
					"display: none;");

			if((has("ie") === 8 || has("ie") === 10) && !has("quirks")){
				tableRule = miscUtil.addCssRule(".dgrid-row-table", "display: inline-table;");

				window.setTimeout(function(){
					tableRule.remove();
					grid.resize();
					
					window.setTimeout(function(){
						grid.resizeColumnHiderMenu();				
					}, 5);
				}, 0);
			} else {
				// [GTI] JU: resize menu
				window.setTimeout(function(){
					grid.resizeColumnHiderMenu();				
				}, 5);
			}
		},
		
		_showColumn: function(id){
			// summary:
			//		Shows the column indicated by the given id
			//		(by removing the rule responsible for hiding it).
			
			if(this._columnHiderRules[id]){
				this._columnHiderRules[id].remove();
				delete this._columnHiderRules[id];
			}
			var grid = this;
			// [GTI] JU: resize menu
			window.setTimeout(function(){
				grid.resizeColumnHiderMenu();				
			}, 5);
		},
		
		_updateColumnHiddenState: function(id, hidden, noResize){
			// summary:
			//		Performs internal work for toggleColumnHiddenState; see the public
			//		method for more information.
			
			// AR: added no resize, to prevent multiple resize when multiple columns are going to be changed
			// resize should be then handled manualy if needed
			
			this[hidden ? '_hideColumn' : '_showColumn'](id);
			
			// Update hidden state in actual column definition,
			// in case columns are re-rendered.
			this.columns[id].hidden = hidden;
			
			// Emit event to notify of column state change.
			listen.emit(this.domNode, "dgrid-columnstatechange", {
				grid: this,
				column: this.columns[id],
				hidden: hidden,
				bubbles: true
			});

			// Adjust the size of the header.
			!noResize && this.resize();
		},
		
		toggleColumnHiddenState: function(id, hidden, noResize){
			// summary:
			//		Shows or hides the column with the given id.
			// id: String
			//		ID of column to show/hide.
			// hide: Boolean?
			//		If specified, explicitly sets the hidden state of the specified
			//		column.  If unspecified, toggles the column from the current state.
			
			// AR: added no resize, to prevent multiple resize when multiple columns are going to be changed
			// resize should be then handled manualy if needed
			
			if(typeof hidden === "undefined"){ hidden = !this._columnHiderRules[id]; }
			this._updateColumnHiddenState(id, hidden, noResize);
			
			// Since this can be called directly, re-sync the appropriate checkbox.
			this._columnHiderCheckboxes[id].checked = !hidden;
		}
	});
});
